import { FullSaver } from "../isaver";
import { IStorage } from "../storage";
import crypto from "crypto"
import path from "path/posix"
import Axios, { AxiosInstance } from 'axios'
import { retry } from "../retry"
import { v4 as UUIDV4 } from "uuid"

function lowercaseHeader(headers: any): { [key: string]: string } {
    let _h: { [key: string]: string } = {};
    for (let key in headers) {
        _h[key.toLowerCase()] = headers[key];
    }
    return _h
}
function createAxios(accessKey: string, secret: string, endpoint: string, blucket: string): AxiosInstance {
    let axios = Axios.create({
        baseURL: endpoint
    });
    axios.interceptors.request.use(config => {
        if (!config.headers) {
            config.headers = {};
        }
        let d = new Date();
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
        info.push(path.join('/', blucket, config.url || ""));

        const signature = crypto.createHmac('sha1', secret).update(Buffer.from(info.join("\n"), "utf8")).digest('base64');

        config.headers["authorization"] = `OSS ${accessKey}:${signature}`
        config.headers["date"] = d.toUTCString();
        //console.log(info);
        return config;
    })
    return axios;
}

export class OSSStorage extends FullSaver implements IStorage {
    axios = createAxios(this.accessKey, this.secret, `https://${this.blucket}.${this.host}`, this.blucket)
    private _id: string = "";
    constructor(private accessKey: string, private secret: string, private host: string, private blucket: string, private root: string = "/") {
        super();
    }
    protected _saver_write(content: string): Promise<void | undefined> {

        return this.save(Buffer.from(content, "utf8"), "inodes.json","application/json").then(() => { })
    }
    protected _saver_read(): Promise<string | undefined> {
        return this.read("inodes.json").then(buffer => {
            return buffer.toString("utf8");
        }).catch(e => {
            if (e.message === "NotFound") {
                return JSON.stringify({ timestamp: 0, inodes: {} })
            }
            throw e;
        })
    }
    read(content: string): Promise<Buffer> {
        let _path = path.join('/', this.root, content);
        return this.getFile(_path);
    }
    save(buffer: Buffer, origin?: string | undefined, mimeType: string = "application/octet-stream"): Promise<string> {
        let fileName = origin || UUIDV4();
        let paths = path.join('/', this.root, fileName);
        return this.axios.put(paths, buffer, { headers: { "x-oss-forbid-overwrite": "false", "Content-Type": mimeType } }).then(res => {
            return fileName;
        }).catch(e => {
            throw e;
        })

    }
    delete(content: string): Promise<void> {
        let _path = path.join('/', this.root, content);
        return this.axios.delete(_path).then(()=>{});
        
    }
    get type(): string {
        return "oss";
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
        //let _path = path.join('/', this.root, ".fog");

        try {
            let buf: Buffer = await this.read(".fog");
            let file = buf.toString("utf8");
            let fog = JSON.parse(file);
            this._id = fog.id;

        }
        catch (e: any) {
            //throw e;
        }
        if (!this._id) {
            let id = UUIDV4();
            await this.save(Buffer.from(JSON.stringify({ id: id })), ".fog","application/json");
            this._id = id
        }

        return !!this._id;
    }
    private getFile(path: string): Promise<Buffer> {
        return this.axios.get(path,{responseType:"blob"})
            .then(function (res) {
                return res.data;
            }).catch(function (e) {
                if (e.response.status === 404) {
                    throw new Error("NotFound");
                }
                else if (e.response.status === 403) {
                    throw new Error("Forbidden");
                }
                throw e;
            })

    }
}