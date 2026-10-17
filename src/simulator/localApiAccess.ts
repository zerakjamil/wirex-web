export function localApiError(request:Request,enabled=process.env.WIREX_LOCAL_API==='1'):string|null {
  if(!enabled)return 'Local study-vault and desktop operations are disabled on this server. Use browser saves; these operations require a private local installation.'
  const url=new URL(request.url)
  if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname))return 'This operation is only available on a private loopback server.'
  const origin=request.headers.get('origin')
  if((origin && origin!==url.origin) || request.headers.get('sec-fetch-site')==='cross-site')return 'Cross-origin access to local machine data is blocked.'
  if(request.method!=='GET' && origin!==url.origin)return 'Local mutations require a matching request origin.'
  return null
}
