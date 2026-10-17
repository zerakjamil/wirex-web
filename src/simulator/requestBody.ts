export async function readBoundedJson(request:Request,maxBytes=8*1024*1024):Promise<Record<string,unknown>> {
  if(Number(request.headers.get('content-length'))>maxBytes)throw new Error('Request body is too large.')
  const reader=request.body?.getReader()
  if(!reader)throw new Error('A JSON object is required.')
  const chunks:Uint8Array[]=[]
  let size=0
  while(true){
    const {value,done}=await reader.read()
    if(done)break
    size+=value.byteLength
    if(size>maxBytes){await reader.cancel();throw new Error('Request body is too large.')}
    chunks.push(value)
  }
  const body:unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if(!body || typeof body!=='object' || Array.isArray(body))throw new Error('A JSON object is required.')
  return body as Record<string,unknown>
}
