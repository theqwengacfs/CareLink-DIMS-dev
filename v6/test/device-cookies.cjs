/* Browser cookie transport for the pre-existing functional suites. Those suites
   share one approved office browser; dedicated device-security tests use a
   separate jar per browser and assert pending/approval/revocation explicitly. */
const sharedJar={cookie:''};
async function dispatchWithDeviceCookie(handler,req,res,jar=sharedJar){
  if(jar.cookie && !Object.hasOwn(req.headers,'cookie')) req.headers.cookie=jar.cookie;
  const original=res.setHeader.bind(res);
  res.setHeader=(name,value)=>{
    if(String(name).toLowerCase()==='set-cookie'){
      const cookies=Array.isArray(value)?value:[value];
      for(const cookie of cookies) if(String(cookie).startsWith('carelink_device_v1=')) jar.cookie=String(cookie).split(';')[0];
    }
    return original(name,value);
  };
  return handler(req,res);
}
module.exports={dispatchWithDeviceCookie,sharedJar};
