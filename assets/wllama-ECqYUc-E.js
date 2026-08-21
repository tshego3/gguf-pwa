var e=Object.defineProperty,t=Object.defineProperties,n=Object.getOwnPropertyDescriptors,r=Object.getOwnPropertySymbols,i=Object.prototype.hasOwnProperty,a=Object.prototype.propertyIsEnumerable,o=(e,t)=>(t=Symbol[e])?t:Symbol.for(`Symbol.`+e),s=(t,n,r)=>n in t?e(t,n,{enumerable:!0,configurable:!0,writable:!0,value:r}):t[n]=r,c=(e,t)=>{for(var n in t||={})i.call(t,n)&&s(e,n,t[n]);if(r)for(var n of r(t))a.call(t,n)&&s(e,n,t[n]);return e},l=(e,r)=>t(e,n(r)),u=(e,t,n)=>s(e,typeof t==`symbol`?t:t+``,n),d=(e,t,n)=>new Promise((r,i)=>{var a=e=>{try{s(n.next(e))}catch(e){i(e)}},o=e=>{try{s(n.throw(e))}catch(e){i(e)}},s=e=>e.done?r(e.value):Promise.resolve(e.value).then(a,o);s((n=n.apply(e,t)).next())}),f=(e,t,n)=>(t=e[o(`asyncIterator`)])?t.call(e):(e=e[o(`iterator`)](),t={},n=(n,r)=>(r=e[n])&&(t[n]=t=>new Promise((n,i,a)=>(t=r.call(e,t),a=t.done,Promise.resolve(t.value).then(e=>n({value:e,done:a}),i)))),n(`next`),n(`return`),t);new Uint8Array([71,76,85,69]),new TextDecoder;var p=e=>e.reduce((e,t)=>e+t,0),m=e=>!!e?.startsWith,h=/^.*\.gguf(?:\?.*)?$/,g=e=>h.test(e),_=()=>!!navigator.userAgent.match(/Version\/([0-9\._]+).*Mobile.*Safari.*/),v=e=>{let t=URL.createObjectURL(m(e)?new Blob([e],{type:`text/javascript`}):e);return new Worker(t,{type:`module`})},y=`let accessHandle;
let abortController = new AbortController();

async function openFile(filename) {
  const opfsRoot = await navigator.storage.getDirectory();
  const cacheDir = await opfsRoot.getDirectoryHandle('cache', { create: true });
  const fileHandler = await cacheDir.getFileHandle(filename, { create: true });
  accessHandle = await fileHandler.createSyncAccessHandle();
  accessHandle.truncate(0); // clear file content
}

async function writeFile(buf) {
  accessHandle.write(buf);
}

async function closeFile() {
  accessHandle.flush();
  accessHandle.close();
}

async function writeTextFile(filename, str) {
  await openFile(filename);
  await writeFile(new TextEncoder().encode(str));
  await closeFile();
}

const throttled = (func, delay) => {
  let lastRun = 0;
  return (...args) => {
    const now = Date.now();
    if (now - lastRun > delay) {
      lastRun = now;
      func.apply(null, args);
    }
  };
};

const assertNonNull = (val) => {
  if (val === null || val === undefined) {
    throw new Error('OPFS Worker: Assertion failed');
  }
};

// respond to main thread
const resOK = () => postMessage({ ok: true });
const resProgress = (loaded, total) =>
  postMessage({ progress: { loaded, total } });
const resErr = (err) => postMessage({ err });

onmessage = async (e) => {
  try {
    if (!e.data) return;

    /**
     * @param {Object} e.data
     *
     * Fine-control FS actions:
     * - { action: 'open', filename: 'string' }
     * - { action: 'write', buf: ArrayBuffer }
     * - { action: 'close' }
     *
     * Simple write API:
     * - { action: 'write-simple', filename: 'string', buf: ArrayBuffer }
     *
     * Download API:
     * - { action: 'download', url: 'string', filename: 'string', options: Object, metadataFileName: 'string' }
     * - { action: 'download-abort' }
     */
    const {
      action,
      filename,
      buf,
      url,
      options,
      metadataFileName,
      metadataAdditional,
    } = e.data;

    if (action === 'open') {
      assertNonNull(filename);
      await openFile(filename);
      return resOK();
    } else if (action === 'write') {
      assertNonNull(buf);
      await writeFile(buf);
      return resOK();
    } else if (action === 'close') {
      await closeFile();
      return resOK();
    } else if (action === 'write-simple') {
      assertNonNull(filename);
      assertNonNull(buf);
      await openFile(filename);
      await writeFile(buf);
      await closeFile();
      return resOK();
    } else if (action === 'download') {
      assertNonNull(url);
      assertNonNull(filename);
      assertNonNull(metadataFileName);
      assertNonNull(options);
      assertNonNull(options.aborted);
      abortController = new AbortController();
      if (options.aborted) abortController.abort();
      const response = await fetch(url, {
        ...options,
        signal: abortController.signal,
      });
      const contentLength = response.headers.get('content-length');
      const etag = (response.headers.get('etag') || '').replace(
        /[^A-Za-z0-9]/g,
        ''
      );
      const total = parseInt(contentLength, 10);
      const reader = response.body.getReader();
      await openFile(filename);
      let loaded = 0;
      const throttledProgress = throttled(resProgress, 100);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        loaded += value.byteLength;
        await writeFile(value);
        throttledProgress(loaded, total);
      }
      resProgress(total, total); // 100% done
      await closeFile();
      // make sure this is in-sync with CacheEntryMetadata
      await writeTextFile(
        metadataFileName,
        JSON.stringify({
          originalURL: url,
          originalSize: total,
          etag,
          ...metadataAdditional,
        })
      );
      return resOK();
    } else if (action === 'download-abort') {
      if (abortController) {
        abortController.abort();
      }
      return;
    }

    throw new Error('OPFS Worker: Invalid action', e.data);
  } catch (err) {
    return resErr(err);
  }
};
`;function b(e,t){return d(this,null,function*(){if(!e.includes(`/resolve/`))return;let n=e.replace(`/resolve/`,`/raw/`);try{let e=(yield fetch(n,{headers:t}).then(e=>e.text())).match(/^oid sha256:([0-9a-f]{64})$/m);return e?e[1]:void 0}catch{return}})}var x=class{isSupported(){return typeof navigator<`u`&&`storage`in navigator&&!!navigator.storage?.getDirectory}read(e){return d(this,null,function*(){try{return yield(yield(yield S()).getFileHandle(e)).getFile()}catch{return null}})}write(e,t){return d(this,null,function*(){let n=yield C(e);yield n.truncate(0);let r=t.getReader();try{for(;;){let{done:e,value:t}=yield r.read();if(e)break;yield n.write(t)}}finally{yield n.close()}})}getSize(e){return d(this,null,function*(){try{return(yield(yield(yield S()).getFileHandle(e)).getFile()).size}catch{return-1}})}list(){return d(this,null,function*(){let e=yield S(),t=[];try{for(var n=f(e.entries()),r,i,a;r=!(i=yield n.next()).done;r=!1){let[e,n]=i.value;if(n.kind===`file`){let r=yield n.getFile();t.push({key:e,size:r.size})}}}catch(e){a=[e]}finally{try{r&&(i=n.return)&&(yield i.call(n))}finally{if(a)throw a[0]}}return t})}delete(e){return d(this,null,function*(){try{yield(yield S()).removeEntry(e)}catch(e){if(e?.name!==`NotFoundError`)throw e}})}};function S(){return d(this,null,function*(){return(yield navigator.storage.getDirectory()).getDirectoryHandle(`cache`,{create:!0})})}function C(e){return d(this,null,function*(){let t=v(y),n,r;t.onmessage=e=>{e.data.ok?n(null):e.data.err&&r(e.data.err)},t.onerror=e=>r?.(e.message??e);let i=e=>new Promise((i,a)=>{n=i,r=a,t.postMessage(e,_()?void 0:{transfer:`buf`in e&&e.buf?[e.buf.buffer]:[]})});return yield i({action:`open`,filename:e}),{truncate:()=>d(this,null,function*(){}),write:e=>i({action:`write`,buf:e}),close:()=>d(this,null,function*(){yield i({action:`close`}),t.terminate()})}})}function w(e){return{algorithm:`SHA-256`,value:e}}var T=class{isSupported(){return typeof navigator<`u`&&`crossOriginStorage`in navigator}read(e){return d(this,null,function*(){try{return(yield navigator.crossOriginStorage.requestFileHandle(w(e))).getFile()}catch{return null}})}write(e,t){return d(this,null,function*(){let n=yield(yield navigator.crossOriginStorage.requestFileHandle(w(e),{create:!0})).createWritable(),r=t.getReader();try{for(;;){let{done:e,value:t}=yield r.read();if(e)break;yield n.write(t)}}finally{yield n.close()}})}getSize(e){return d(this,null,function*(){try{return(yield(yield navigator.crossOriginStorage.requestFileHandle(w(e))).getFile()).size}catch{return-1}})}list(){return d(this,null,function*(){throw Error(`not implemented`)})}delete(e){return d(this,null,function*(){throw Error(`not implemented`)})}},E=class{constructor(){u(this,`cos`,new T),u(this,`priv`,new x)}isSupported(){return this.priv.isSupported()}read(e,t){return d(this,null,function*(){if(t?.sha256&&this.cos.isSupported()){let e=yield this.cos.read(t.sha256);if(e)return e}return this.priv.read(e)})}write(e,t,n){return d(this,null,function*(){n?.sha256&&this.cos.isSupported()?yield this.cos.write(n.sha256,t):yield this.priv.write(e,t)})}getSize(e,t){return d(this,null,function*(){if(t?.sha256&&this.cos.isSupported()){let e=yield this.cos.getSize(t.sha256);if(e!==-1)return e}return this.priv.getSize(e)})}list(){return d(this,null,function*(){return this.priv.list()})}delete(e){return d(this,null,function*(){return this.priv.delete(e)})}},D=`__metadata__`,O=`polyfill_for_older_version`;function k(e){if(e&&e.sha256)return{sha256:e.sha256}}var A=class{constructor(e=[new E]){u(this,`sb`);for(let t of e)if(t.isSupported()){this.sb=t;return}throw Error(`No supported storage backend found`)}getNameFromURL(e){return d(this,null,function*(){return j(e,``)})}write(e,t,n){return d(this,null,function*(){yield this.sb.write(e,t),yield this.writeMetadata(e,n)})}download(e){return d(this,arguments,function*(e,t={}){let n=yield j(e,``),r=yield b(e,t.headers??{}),i=r?{sha256:r}:void 0,a=yield this.sb.getSize(n,i);if(a!==-1){let i=yield this.readMetadata(n);if(i?.originalURL===e&&i.originalSize===a)return;let o=yield fetch(e,c({method:`HEAD`},t.headers?{headers:t.headers}:{})),s=parseInt(o.headers.get(`content-length`)??`0`,10),l=(o.headers.get(`etag`)||``).replace(/[^A-Za-z0-9]/g,``);if(s>0&&s===a){yield this.writeMetadata(n,c({originalURL:e,originalSize:s,etag:l,sha256:r},t.metadataAdditional??{}));return}yield this.sb.delete(n),yield this.sb.delete(`${D}${n}`)}let o=yield fetch(e,c(c({},t.headers?{headers:t.headers}:{}),t.signal?{signal:t.signal}:{}));if(!o.ok||!o.body)throw Error(`Failed to fetch ${e}: HTTP ${o.status}`);let s=o.headers.get(`content-length`),l=(o.headers.get(`etag`)||``).replace(/[^A-Za-z0-9]/g,``),u=parseInt(s??`0`,10),d=t.progressCallback,f=0,p=0,m=new TransformStream({transform(e,t){if(f+=e.byteLength,d){let e=Date.now();e-p>100&&(p=e,d({loaded:f,total:u}))}t.enqueue(e)},flush(){d?.({loaded:f,total:u||f})}}),h=c({originalURL:e,originalSize:u,etag:l},t.metadataAdditional??{});r&&(h.sha256=r),yield this.sb.write(n,o.body.pipeThrough(m),i),yield this.writeMetadata(n,h)})}open(e){return d(this,null,function*(){let t=k(yield this.getMetadata(e)),n=yield this.sb.read(e,t);if(n)return n;let r=yield j(e,``),i=k(yield this.getMetadata(r));return this.sb.read(r,i)})}getSize(e){return d(this,null,function*(){let t=k(yield this.getMetadata(e));return this.sb.getSize(e,t)})}getMetadata(e){return d(this,null,function*(){let t=yield this.readMetadata(e);if(t)return t;let n=yield this.sb.getSize(e);return n>0?{etag:O,originalSize:n,originalURL:``}:null})}readMetadata(e){return d(this,null,function*(){let t=yield this.sb.read(`${D}${e}`);if(!t)return null;try{return yield new Response(t).json()}catch{return null}})}list(){return d(this,null,function*(){let e=yield this.sb.list(),t={};for(let{key:n}of e)if(n.startsWith(D)){let e=yield this.sb.read(n);if(e){let r=yield new Response(e).json().catch(()=>null);t[n.slice(D.length)]=r}}let n=[];for(let{key:r,size:i}of e)r.startsWith(D)||n.push({name:r,size:i,metadata:t[r]||{originalSize:i,originalURL:``,etag:``}});return n})}clear(){return d(this,null,function*(){yield this.deleteMany(()=>!0)})}delete(e){return d(this,null,function*(){let t=yield this.getNameFromURL(e);yield this.deleteMany(n=>n.name===e||n.name===t)})}deleteMany(e){return d(this,null,function*(){let t=yield this.list();for(let n of t)e(n)&&(yield this.sb.delete(n.name),yield this.sb.delete(`${D}${n.name}`))})}writeMetadata(e,t){return d(this,null,function*(){let n=new Blob([JSON.stringify(t)],{type:`text/plain`});yield this.sb.write(`${D}${e}`,n.stream())})}};function j(e,t){return d(this,null,function*(){let n=yield crypto.subtle.digest(`SHA-1`,new TextEncoder().encode(e));return`${t}${Array.from(new Uint8Array(n)).map(e=>e.toString(16).padStart(2,`0`)).join(``)}_${e.split(`/`).pop()}`})}var M=3,N=(e=>(e.VALID=`valid`,e.INVALID=`invalid`,e.DELETED=`deleted`,e))(N||{}),P=class{constructor(e,t,n,r){u(this,`modelManager`),u(this,`url`),u(this,`mmprojUrl`),u(this,`size`),u(this,`files`),this.modelManager=e,this.url=t,this.mmprojUrl=n,r?(this.files=this.getAllFiles(r),this.size=p(this.files.map(e=>e.metadata.originalSize))):(this.files=[],this.size=0)}open(){return d(this,null,function*(){if(this.size===-1)throw new I(`Model is deleted from the cache; Call ModelManager.downloadModel to re-download the model`,`load_error`);let e=[];for(let t of this.files){let n=yield this.modelManager.cacheManager.open(t.name);if(!n)throw Error(`Failed to open file ${t.name}; Hint: the model may be invalid, please refresh it`);e.push(n)}return e})}validate(){let e=F.parseModelUrl(this.url).length;if(this.mmprojUrl&&(e+=1),this.size===-1)return`deleted`;if(this.size<16||this.files.length!==e)return`invalid`;for(let e of this.files)if(!e.metadata||e.metadata.originalSize!==e.size)return`invalid`;return`valid`}refresh(){return d(this,arguments,function*(e={}){let t=F.parseModelUrl(this.url);this.mmprojUrl&&t.push(this.mmprojUrl);let n=t.map((e,t)=>({url:e,index:t}));this.modelManager.logger.debug(`Downloading model files:`,t);let r=this.modelManager.params.parallelDownloads??M,i=yield this.getTotalDownloadSize(t),a=[],o=()=>d(this,null,function*(){for(;n.length>0;){let t=n.shift();if(!t)break;yield this.modelManager.cacheManager.download(t.url,l(c({},e),{metadataAdditional:{originalURL:t.url,mmprojURL:this.mmprojUrl},progressCallback:({loaded:n})=>{var r;a[t.index]=n,(r=e.progressCallback)==null||r.call(e,{loaded:p(a),total:i})}}))}}),s=[];for(let e=0;e<r;e++)s.push(o()),a.push(0);yield Promise.all(s),this.files=this.getAllFiles(yield this.modelManager.cacheManager.list()),this.size=this.files.reduce((e,t)=>e+t.metadata.originalSize,0)})}remove(){return d(this,null,function*(){this.files=this.getAllFiles(yield this.modelManager.cacheManager.list()),yield this.modelManager.cacheManager.deleteMany(e=>!!this.files.find(t=>t.name===e.name)),this.size=-1})}getAllFiles(e){let t=new Set(F.parseModelUrl(this.url));this.mmprojUrl&&t.add(this.mmprojUrl);let n=[];for(let r of t){let t=e.find(e=>e.metadata.originalURL===r);if(!t)throw Error(`Model file not found: ${r}`);n.push(t)}return n.sort((e,t)=>e.metadata.originalURL.localeCompare(t.metadata.originalURL)),n}getTotalDownloadSize(e){return d(this,null,function*(){return p((yield Promise.all(e.map(e=>fetch(e,{method:`HEAD`})))).map(e=>Number(e.headers.get(`content-length`)||`0`)))})}},F=class e{constructor(e={}){u(this,`cacheManager`),u(this,`params`),u(this,`logger`),this.cacheManager=e.cacheManager||new A,this.params=e,this.logger=e.logger||console}static parseModelUrl(e){if(Array.isArray(e))return e;let t=/-(\d{5})-of-(\d{5})\.gguf(?:\?.*)?$/,n=e.match(/\.gguf(\?.*)?$/)?.[1]??``,r=e.match(t);if(!r)return[e];let i=e.replace(t,``),a=r[2];return Array.from({length:Number(a)},(e,t)=>(t+1).toString().padStart(5,`0`)).map(e=>`${i}-${e}-of-${a}.gguf${n}`)}getModels(){return d(this,arguments,function*(t={}){let n=yield this.cacheManager.list(),r=[];for(let t of n){if(!t.metadata.originalURL)continue;let i=e.parseModelUrl(t.metadata.originalURL),a=t.metadata.mmprojURL;(i.length===1||i[0]===t.metadata.originalURL)&&r.push(new P(this,t.metadata.originalURL,a,n))}return t.includeInvalid||(r=r.filter(e=>e.validate()===`valid`)),r})}downloadModel(e){return d(this,arguments,function*(e,t={}){let n=m(e)?{url:e}:e;if(!g(n.url))throw new I(`Invalid model URL: ${n.url}; URL must ends with ".gguf"`,`download_error`);let r=new P(this,n.url,n.mmprojUrl);return r.validate()!==`valid`&&(yield r.refresh(t)),r})}getModelOrDownload(e){return d(this,arguments,function*(e,t={}){var n;let r=(yield this.getModels()).find(t=>t.url===e.url);return r?((n=t.progressCallback)==null||n.call(t,{loaded:r.size,total:r.size}),r):this.downloadModel(e,t)})}clear(){return d(this,null,function*(){yield this.cacheManager.clear()})}};l(c({},console),{debug:()=>{}});var I=class extends Error{constructor(e,t=`unknown_error`){super(e),u(this,`type`),this.type=t}};export{N as n,F as t};