/// <reference path="../../d/axios.d.ts" />
import { FullSaver } from "../isaver";
import { IStorage } from "../storage";
import crypto from "node:crypto"
import path from "node:path/posix"
import Axios, { AxiosInstance } from 'axios'
import { v4 as UUIDV4 } from "uuid"
import { URL } from "node:url";
import { Promise } from "bluebird";

interface UploadTask {
    auth_info: string,
    upload_url: string,
    bucket: string,
    obj_key: string,
    upload_id: string,
    auth_info_expried: number,
    task_id: string,
    format_type: string,
    callback: string
}
function lowercaseHeader(headers: any): { [key: string]: string } {
    let _h: { [key: string]: string } = {};
    for (let key in headers) {
        _h[key.toLowerCase()] = headers[key];
    }
    return _h
}
function createAxios(_cookies: string): AxiosInstance {
    let axios = Axios.create({
        //baseURL: endpoint
    });
    let cookies: { [key: string]: string } = {};
    let cookieList = _cookies.split(";");
    cookieList.forEach(item => {
        let kv = item.split("=");
        let k = kv[0].trim(), v = kv[1].trim();
        cookies[k] = v;
    })

    //return axios;
    axios.interceptors.request.use(config => {
        //console.log(config.url);
        let u = new URL(config.url || "");

        if (!config.headers) {
            config.headers = {};
        }
        if (u.hostname.endsWith(".quark.cn")) {
            config.headers["cookie"] = Object.keys(cookies).map(item => `${item}=${cookies[item]}`).join("; ");

            return config;
        }
        else if (!u.hostname.endsWith("oss-cn-shenzhen.aliyuncs.com")) {
            return config;
        }
        let task: UploadTask | undefined = config.customize;
        if (!task) throw new Error("缺少上传任务信息");
        let d = new Date();
        config.headers["x-oss-date"] = d.toUTCString();
        config.headers["x-oss-user-agent"] = "aliyun-sdk-js/1.0.0 Chrome 107.0.0.0 on Windows 10 64-bit";
        let headers = lowercaseHeader(config.headers || {});
        let info: string[] = [];
        info.push(config.method?.toUpperCase() || "")
        if (config.data) {
            let md5 = crypto.createHash("md5");
            md5.update(config.data);
            let contentMD5 = md5.digest().toString("base64");
            info.push(contentMD5)
            config.headers["Content-MD5"] = contentMD5;
        }
        else {
            info.push("");
        }

        info.push(headers["content-type"] || "");
        info.push(d.toUTCString())

        //加入x-oss头处理
        const OSS_PREFIX = 'x-oss-';
        const ossHeaders: string[] = [];
        const headersToSign: { [key: string]: string } = {};
        Object.keys(headers).forEach((key) => {
            const lowerKey = key.toLowerCase();
            if (lowerKey.indexOf(OSS_PREFIX) === 0) {
                headersToSign[lowerKey] = String(headers[key]).trim();
            }
        });

        Object.keys(headersToSign).sort().forEach((key) => {
            ossHeaders.push(`${key}:${headersToSign[key]}`);
        });
        info = info.concat(ossHeaders);
        //console.log(config);

        info.push(path.join('/', task.bucket, u.pathname + (u.search || "")));
        //console.log(info);
        config.headers["date"] = d.toUTCString();
        return axios.post("https://drive.quark.cn/1/clouddrive/file/upload/auth?pr=ucpro&fr=pc", { "task_id": task.task_id, "auth_info": task.auth_info, "auth_meta": info.join("\n") })
            .then(response => {
                let { auth_key } = response.data.data;
                if (!config.headers) {
                    config.headers = {};
                }
                config.headers["authorization"] = auth_key;
                return config;
            })
        // const signature = crypto.createHmac('sha1', secret).update(Buffer.from(info.join("\n"), "utf8")).digest('base64');

        // config.headers["authorization"] = `OSS ${accessKey}:${signature}`
        // config.headers["date"] = d.toUTCString();
        //console.log(info);
        //return config;
    });
    axios.interceptors.response.use(response => {
        //console.log(`[${response.status}] ${response.config.url}`)
        let u = new URL(response.config.url || "");
        if (u.hostname.endsWith(".quark.cn")) {
            let setCookies = response.headers["set-cookie"];
            if (setCookies) {
                setCookies.forEach(item => {
                    let i = item.replace(/;.*$/ig, '');
                    let kv = i.split("=");
                    cookies[kv[0].trim()] = kv[1].trim();
                    //console.log("更新cookie",cookies);
                })
            }
        }
        return response;
    })
    return axios;
}
/**
 * 
 * 存在的问题：
 * 夸克使用的是阿里云的OSS进行存储，在传输大文件时，使用的分块上传，但是当块的数量大于等于2时，合并时会失败，这里强制分块数量为1
 * 
 */
export class QuarkStorage extends FullSaver implements IStorage {
    axios = createAxios(this.cookies)
    private _id: string = "";
    private _last_cookie: number = 0;
    constructor(private cookies: string, private root: string) {
        super();
    }
    protected async _saver_write(content: string): Promise<void | undefined> {

        let fid = await this.save(Buffer.from(content, "utf8"), ".inodes.json", "application/json");
        if (fid !== ".inodes.json") {
            let ofid = await this.getFid(this.root, ".inodes.json");
            if (ofid) {
                await this.delete(ofid);
            }
            await this.rename(fid, ".inodes.json");
        }
    }
    protected _saver_read(): Promise<string | undefined> {
        return this.getFid(this.root, ".inodes.json").then(fid => {
            if (fid) return this.read(fid);
            throw new Error("NotFound")
        }).then(buffer => {
            return buffer.toString("utf8");
        }).catch(e => {
            if (e.message === "NotFound") {
                return JSON.stringify({ timestamp: 0, inodes: {} })
            }
            throw e;
        })
    }
    read(content: string): Promise<Buffer> {
        return this.getFile(content);
    }
    async save(buffer: Buffer, origin?: string | undefined, mimeType: string = "application/octet-stream"): Promise<string> {
        let response = await this.axios.post("https://drive.quark.cn/1/clouddrive/file/upload/pre?pr=ucpro&fr=pc", { "ccp_hash_update": true, "parallel_upload": true, "pdir_fid": this.root, "dir_name": "", "size": buffer.length, "file_name": `${UUIDV4()}.bin`, "format_type": "application/octet-stream", "l_updated_at": Date.now(), "l_created_at": Date.now() }, { headers: { cookie: this.cookies } })
        let { auth_info, upload_url, bucket, obj_key, upload_id, auth_info_expried, task_id, format_type, callback } = response.data.data;
        let task: UploadTask = {
            task_id: task_id,
            auth_info: auth_info,
            upload_url: upload_url,
            upload_id: upload_id,
            bucket: bucket,
            obj_key: obj_key,
            auth_info_expried: auth_info_expried,
            format_type: format_type,
            callback: Buffer.from(JSON.stringify(callback)).toString("base64")
        }

        let { part_size } = response.data.metadata;
        let md5 = crypto.createHash("md5");
        md5.update(buffer);
        let bufferMD5 = md5.digest().toString("hex");
        let hash = crypto.createHash("sha1")
        hash.update(buffer)
        let sha1 = hash.digest('hex')
        response = await this.axios.post("https://drive.quark.cn/1/clouddrive/file/update/hash?pr=ucpro&fr=pc", { "task_id": task.task_id, "md5": bufferMD5, "sha1": sha1 });
        if (response.data.data.finish) {
            return response.data.data.fid;
        }

        let subBuffers: {
            buffer: Buffer,
            offset: number
        }[] = [{
            offset: 0,
            buffer: buffer
        }];

        return Promise.all(subBuffers.map((buf, index) => Promise.resolve({ content: buf, index: index }).then(req => {
            let url = upload_url.replace("http://", `https://${bucket}.`);
            url = `${url}/${obj_key}?partNumber=${req.index + 1}&uploadId=${upload_id}`;
            let headers: { [key: string]: string } = {
                "Content-Type": format_type
            }
            if (buf.offset > 0) {
                headers["X-Oss-Hash-Ctx"] = this.getHashCtx(buf.offset, buf.buffer);
            }
            return this.axios.put(url, buf.buffer, {
                headers: headers,
                customize: task
            }).then(response => {

                return {
                    etag: response.headers["etag"],
                    number: req.index + 1
                }
            }).then(res => {

                return `<Part><PartNumber>${res.number}</PartNumber><ETag>${res.etag}</ETag></Part>`
            })

        }))).then(parts => {
            //console.log(parts);//
            return `<?xml version="1.0" encoding="UTF-8"?>\n<CompleteMultipartUpload>\n${parts.join('\n')}\n</CompleteMultipartUpload>`
        }).then(body => {
            let url = upload_url.replace("http://", `https://${bucket}.`);
            url = `${url}/${obj_key}?uploadId=${upload_id}`;
            return this.axios.post(url, body, { customize: task, headers: { "x-oss-callback": task.callback, "Content-Type": "application/xml" } })

        }).then(response => {
            if (response.data.Status === "OK") {
                return this.axios.post("https://drive.quark.cn/1/clouddrive/file/upload/finish?pr=ucpro&fr=pc", { "obj_key": obj_key, "task_id": task_id }).then(response => {
                    return response.data.data.fid;
                }).then(fid => {
                    if (origin) {
                        return this.delete(origin).then(() => fid)
                    }
                    return fid;
                })
            }
            //console.log(response);
            throw new Error("WriteFail")
        }).catch(e => {
            //console.log(e);
            throw e;
        })

    }

    delete(content: string): Promise<void> {
        return this.axios.post(`https://drive.quark.cn/1/clouddrive/file/delete?pr=ucpro&fr=pc`, { "action_type": 2, "filelist": [content], "exclude_fids": [] }, {
            validateStatus(status) {
                return true;
            },
        }).then(res => {

        });
    }
    get type(): string {
        return "quark";
    }
    private _mode: number = 7;
    get mode(): number {
        return this._mode;
    }
    set mode(v: number) {
        this._mode = v;
    }
    get id(): string {
        return this._id;
    }
    async initialize(): Promise<boolean> {
        await this.flush();
        let fid = await this.getFid(this.root, ".fog");
        if (fid) {
            try {
                let buffer = await this.getFile(fid);
                let content = buffer.toString();
                let fog = JSON.parse(content);
                if (fog.id) {
                    this._id = fog.id;
                    return true;
                }
            }
            catch (e) {
                //console.error(e);
            }
        }
        let fog = { id: UUIDV4() }
        let content = JSON.stringify(fog);
        fid = await this.save(Buffer.from(content), undefined, "application/json");
        let code = await this.rename(fid, ".fog")
        //console.log(fid, code);
        this._id = fog.id;
        return true;
        //return Promise.resolve(true);
    }
    private getFile(fid: string): Promise<Buffer> {
        if (!fid || !fid.length) throw new Error("PID不能为空")
        let p: any;
        if (Date.now() - this._last_cookie > 3 * 60 * 1000) {
            p = this.flush();
        }
        return Promise.resolve(p).then(() => this.axios.post("https://drive.quark.cn/1/clouddrive/file/download?pr=ucpro&fr=pc", { "fids": [fid] }))
            .then(res => {
                if (res.data.data && res.data.data.length) {
                    let download = res.data.data.find((p: { fid: string, download_url: string }) => p.fid === fid)
                    if (download) return download.download_url as string;
                }
                throw new Error("NotFound");
            }).then(url => {
                return this.axios.get(url, { responseType: "blob" }).then((res) => res.data);
            }).catch(e => {
                //console.log(e);
                throw e;
            })
    }
    private flush(): Promise<void> {
        return this.axios.get('https://pan.quark.cn/account/info?__f=true&fr=pc&platform=pc').then(() => this.axios.get('https://drive.quark.cn/1/clouddrive/auth/pc/flush?pr=ucpro&fr=pc').then((res) => {
            this._last_cookie = Date.now();
        }));
    }
    private rename(fid: string, name: string): Promise<number> {
        return this.axios.post("https://drive.quark.cn/1/clouddrive/file/rename?pr=ucpro&fr=pc", { "fid": fid, "file_name": name }, {
            validateStatus: (status) => status === 200 || status === 400
        }).then(res => res.data.code);
    }
    private getFilename(fid: string): Promise<string> {
        return this.axios.get(`https://drive.quark.cn/1/clouddrive/file/info?pr=ucpro&fr=pc&fid=${fid}`).then(res => res.data.file_name);
    }
    private getFid(pdir_fid: string, name: string): Promise<string | undefined> {
        return this.axios.get(`https://drive.quark.cn/1/clouddrive/file/search?pr=ucpro&fr=pc&q=${name}&_page=1&_size=50&_fetch_total=1&_sort=file_type:desc,updated_at:desc&_is_hl=1`)
            .then(res => {
                //console.log(res.data.data.list)
                if (res.data.data.list) {
                    for (let i = 0; i < res.data.data.list.length; i++) {
                        if (res.data.data.list[i].file_name === name && res.data.data.list[i].pdir_fid === this.root) {
                            return res.data.data.list[i].fid;
                        }
                    }
                }
            })
    }
    private getHashCtx(offset: number, buffer: Buffer): string {
        let hash = crypto.createHash("sha1")
        hash.update(buffer)
        let sha1 = hash.digest();
        console.log(sha1);
        let a = BigInt(offset);
        let l = a * 8n & 4294967295n;
        let f = a * 8n >> 32n & 4294967295n;
        let d = [sha1.readUint32LE(), sha1.readUint32LE(4), sha1.readUint32LE(8), sha1.readUint32LE(12), sha1.readUint32LE(16)];//new Uint32Array(sha1, 0, 5);
        let p = [d[0].toString(), d[1].toString(), d[2].toString(), d[3].toString(), d[3].toString()];
        let o = {
            hash_type: "sha1",
            h0: p[0],
            h1: p[1],
            h2: p[2],
            h3: p[3],
            h4: p[4],
            Nl: l.toString(),
            Nh: f.toString(),
            data: "",
            num: "0"
        }
        return Buffer.from(JSON.stringify(o)).toString("base64");
    }
}