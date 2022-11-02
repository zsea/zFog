
import { HTTPCodes, HTTPMethod, HTTPRequestContext } from 'webdav-server/lib/index.v2'
import { ResourceType, OpenWriteStreamMode } from 'webdav-server/lib/manager/v2/fileSystem/CommonTypes'
import { Readable } from 'stream'
import { Errors } from 'webdav-server/lib/Errors'



export default class implements HTTPMethod {
    isValidFor(ctx: HTTPRequestContext, type: ResourceType) {
        return !type || type.isFile;
    }

    chunked(ctx: HTTPRequestContext, inputStream: Readable, callback: () => void) {
        const targetSource = ctx.headers.isSource;

        ctx.getResource((e, r) => {
            if (e) {
                if (!ctx.setCodeFromError(e))
                    ctx.setCode(HTTPCodes.InternalServerError);
                return callback();
            }
            if (!r) {
                ctx.setCode(HTTPCodes.InternalServerError);
                return callback();
            }
            ctx.checkIfHeader(r, () => {
                //ctx.requirePrivilege(targetSource ? [ 'canSource', 'canWrite' ] : [ 'canWrite' ], r, () => {
                let mode: OpenWriteStreamMode = 'canCreate';
                r.type((e, type) => process.nextTick(() => {

                    if (e === Errors.ResourceNotFound) {
                        mode = 'mustCreate';
                    }
                    else if (e) {
                        if (!ctx.setCodeFromError(e))
                            ctx.setCode(HTTPCodes.InternalServerError);
                        return callback();
                    }
                    else if (type && !type.isFile) {
                        ctx.setCode(HTTPCodes.MethodNotAllowed);
                        return callback();
                    }
                    //else{}
                    r.openWriteStream(mode, targetSource, ctx.headers.contentLength, (e, wStream, created) => {
                        if (e) {
                            if (!ctx.setCodeFromError(e))
                                ctx.setCode(e === Errors.IntermediateResourceMissing || e === Errors.WrongParentTypeForCreation ? HTTPCodes.Conflict : HTTPCodes.InternalServerError);
                            return callback();
                        }
                        if (!wStream) {
                            ctx.setCodeFromError(Errors.ResourceNotFound);
                            return callback();
                        }
                        inputStream.pipe(wStream);
                        
                        //inputStream.on("end")
                        wStream.on('finish', (e: any) => {
                            Promise.resolve((wStream as any).done(e)).then(function () {
                                if (created)
                                    ctx.setCode(HTTPCodes.Created);
                                else
                                    ctx.setCode(HTTPCodes.OK);
                                //ctx.invokeEvent('write', r);
                                callback();
                                //console.log("上传成功",created);
                            }).catch(error => {
                                console.log(error);
                                if (!ctx.setCodeFromError(error))
                                    ctx.setCode(HTTPCodes.InternalServerError);
                                callback();
                            });
                        });
                        wStream.on('error', (e) => {
                            if (!ctx.setCodeFromError(e))
                                ctx.setCode(HTTPCodes.InternalServerError)
                            callback();
                        });
                    })
                }))
                //})
            })
        })
    }
}