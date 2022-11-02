export function sleep(ms:number):Promise<void>{
    return new Promise(function(resolve){
        setTimeout(resolve,ms);
    })
}
async function run<T>(fn:()=>Promise<T>,maxTimes:number,interval:number):Promise<T>{
    while(maxTimes==-1||(maxTimes--)>0){
        try{
            return await Promise.resolve<T>(fn());
        }
        catch(e:any){

            if(maxTimes==0){
                throw e.error||e;
            }
            if(e.disable){
                throw e.error
            }
        }
        await sleep(interval);
    }
    return Promise.reject("unknow");
}
export function retry<T>(fn:()=>Promise<T>,maxTimes:number=-1,interval:number=0):Promise<T>{
    return run(fn,maxTimes,interval);
}
export interface RetryError{
    error:any,
    disable:boolean
}