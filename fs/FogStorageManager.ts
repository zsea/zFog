import { v2 as webdav } from '@zsea/webdav-server'
import { FogFileSystem } from './FogFileSystem';
export class FogStorageManager implements webdav.IStorageManager{
    constructor(private totalSize:number=-1){}
    /**
     * 分配指定大小的空间，在create/delete/openWriteStream/propertyManager中有调用
     * @param ctx 
     * @param fs 
     * @param size 
     * @param callback 
     */
    reserve(ctx : webdav.RequestContext, fs : webdav.FileSystem, size : number, callback : (reserved : boolean) => void) : void
    {
        callback(true);
    }

    evaluateCreate(ctx : webdav.RequestContext, fs : webdav.FileSystem, path : webdav.Path, type : webdav.ResourceType, callback : webdav.IStorageManagerEvaluateCallback) : void
    {
        callback(0);
    }
    evaluateContent(ctx : webdav.RequestContext, fs : webdav.FileSystem, expectedSize : number, callback : webdav.IStorageManagerEvaluateCallback) : void
    {
        callback(0);
    }
    evaluateProperty(ctx : webdav.RequestContext, fs : webdav.FileSystem, name : string, value : webdav.ResourcePropertyValue, attributes : webdav.PropertyAttributes, callback :webdav. IStorageManagerEvaluateCallback) : void
    {
        callback(0);
    }
    /**
     * 可用空间，回调-1表示空间无限大
     * @param ctx 
     * @param fs 
     * @param callback 
     */
    available(ctx : webdav.RequestContext, fs : webdav.FileSystem, callback : (available : number) => void) : void
    {
        if(this.totalSize<0) return callback(this.totalSize);
        this.reserved(ctx,fs,(reserved)=>{
            callback(this.totalSize-reserved);
        })
    }
    /**
     * 已用空间
     * @param ctx 
     * @param fs 
     * @param callback 
     */
    reserved(ctx : webdav.RequestContext, fs : webdav.FileSystem, callback : (reserved : number) => void) : void
    {   
        //console.log(ctx.requested.path.toString());
        let size=0;
        if(fs.constructor===FogFileSystem){
            size=(fs as FogFileSystem).getSize(ctx.requested.path.toString());
        }
        callback(size);
    }
}