importScripts('/parser/bridge.js');
self.onmessage = ({data}) => {
  try { self.postMessage({id:data.id,...JSON.parse(self.nativeLabRequest(data.operation,JSON.stringify(data.payload)))}); }
  catch (error) {self.postMessage({id:data.id,error:error.message});}
};
