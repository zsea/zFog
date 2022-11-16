import { IStorage } from "../storage";
import Axios from 'axios'
import { Parallelizer } from "../parallelizer"
import { retry } from "../retry"
import { v4 as UUIDV4 } from "uuid"
import { FullSaver } from "../isaver";
import { logger } from "../../logger";
export interface GithubConfigure {
    access_token: string,
    owner: string,
    repo: string,
    branch: string,
    root: string
}
interface GithubAPIResource {
    name: string,
    path: string,
    type: "dir" | "file",
    size: number,
    sha: string,
    url: string,
    content: string | undefined | null,
    encoding: "base64" | "none" | undefined | null,
    download_url?: string
}
export class GithubStorage extends FullSaver implements IStorage {
    axios = Axios.create({
        baseURL: `https://api.github.com/repos/${this.owner}/${this.repo}/contents`,
        headers: {
            "Authorization": `token ${this.access_token}`,
            "Accept": "application/vnd.github+json"
        }
    });
    private _id: string = "";
    constructor(private access_token: string, private owner: string, private repo: string, private branch: string = "main", private root: string = "/") {
        super();
        
    }
    protected _saver_write(content: string): Promise<void | undefined> {

        return this.save(Buffer.from(content, "utf8"), "inodes.json").then(() => {})
    }
    protected _saver_read(): Promise<string | undefined> {
        return this.read("inodes.json").then(buffer => {
            return buffer.toString("utf8");
        }).catch(e=>{
            if(e.message==="NotFound"){
                return JSON.stringify({timestamp:0,inodes:{}})
            }
            throw e;
        })
    }
    get type(): string {
        return "github"
    }
    private _mode:number=7;
    get mode(): number {
        return this._mode;
    }
    set mode(v:number){
        this._mode=v;
    }
    get id(): string {
        return this._id
    }
    async initialize(): Promise<boolean> {
        
        let path = this.root + ".fog";

        try {
            let file = await this.getFile(path);
            
            if (file.encoding === "base64" && file.type === "file") {
                let content = Buffer.from(file.content as string, "base64").toString("utf8");
                let fog = JSON.parse(content);
                this._id = fog.id;
            }
        }
        catch (e: any) {
            if (e.message !== "NotBlockFile" && e.message !== "NotFound") {
                throw e;
            }
        }
        if (!this._id) {
            let id = UUIDV4();
            await this.save(Buffer.from(JSON.stringify({ id: id })), ".fog");
            this._id = id
        }
        
        return !!this._id;
    }
    cached: {
        [path: string]: {
            sha: string
            timer: NodeJS.Timeout
        }
    } = {}
    parallelizer: Parallelizer = new Parallelizer(10)
    private getFile(path: string): Promise<GithubAPIResource> {
        let self = this;
        return this.axios.get(`${path}?ref=${this.branch}`)
            .then(function (res) {
                
                let body: GithubAPIResource;
                if (Array.isArray(res.data)) {
                    throw new Error("NotBlockFile");
                }
                else {
                    let item = res.data;
                    body = {
                        name: item.name,
                        path: item.path,
                        sha: item.sha,
                        size: item.size || 0,
                        type: item.type,
                        url: item.url,
                        content: item.content,
                        encoding: item.encoding,
                        download_url: item.download_url
                    }
                    if (self.cached[path]) {
                        clearTimeout(self.cached[path].timer);
                    }
                    self.cached[path] = {
                        sha: body.sha,
                        timer: setTimeout(() => { }, 5000)
                    }
                }


                return body;
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
    private getSha(path: string): Promise<string | undefined> {
        if (this.cached[path]) return Promise.resolve(this.cached[path].sha);
        return this.getFile(path).then(function (body) {
            return body.sha;
        }).catch(function (e) {

            if (e.message === "NotBlockFile" || e.message === "NotFound" || e.message === "Forbidden") return undefined;
            throw e;
        }).then(function (sha) {
            return sha;
        });
    }
    read(content: string): Promise<Buffer> {

        let self = this;
        let path = this.root + content;
        return retry(function () {
            return self.parallelizer.execute(function () {
                return self.getFile(path).then(function (body) {
                    //logger.debug(body);
                    if (body.type !== "file") throw new Error("NotBlockFile");
                    if (body.encoding === "base64") {
                        return Buffer.from(body.content as string, "base64");
                    }
                    if (body.encoding === "none") {

                        let download_url = body.download_url;
                        if (!download_url) throw new Error("NotFound");
                        return self.axios.get(download_url,{
                            responseType:"blob"
                        }).then(function (res) {
                            //logger.debug(res.data);
                            return res.data
                        }).catch(function (e) {
                            throw e;
                        })
                    }
                    throw new Error("NotBlockFile");
                }).catch(function (e) {
                    //logger.error(e);
                    if (e.message === "NotBlockFile" || e.message === "NotBase64" || e.message === "NotFound" || e.message === "Forbidden") {
                        throw { error: e, disable: true };
                    }
                    throw e;
                });
            });
        }, 5, 500).then((buffer:Buffer)=>{
            return Buffer.from(buffer.toString("utf8"),"base64");
        });
    }
    save(buffer: Buffer, origin?: string | undefined): Promise<string> {
        buffer=Buffer.from(buffer.toString("base64"),"utf8");
        let content = buffer.toString("base64");
        let path = this.root;
        let fileName = origin;
        if (!fileName) {
            fileName = UUIDV4();
        }
        path = path + fileName;

        let self = this;
        return retry(function () {
            
            return self.parallelizer.execute(function () {

                return self.getSha(path).then(function (sha: string | undefined): Promise<any> {
                    let body: {
                        branch?: string,
                        sha?: string,
                        content: string,
                        message: string
                    } = {
                        branch: self.branch,
                        //sha:sha,
                        content: content,
                        message: "fog:" + Date.now()
                    }
                    if (sha) {
                        body["sha"] = sha;

                    }
                    
                    return self.axios.put(path, body)
                }).then((s) => {
                    return fileName;
                }).finally(function () {
                    delete self.cached[path];
                });
            });
        }, 5, 500);
    }
    delete(content: string): Promise<void> {
        let self = this;
        let path = this.root + content;
        return retry(function () {
            return self.parallelizer.execute(function () {
                return self.getSha(path).then(function (sha: string | undefined): Promise<any> {
                    if (!sha) return Promise.resolve();
                    let body = {
                        branch: self.branch,
                        sha: sha,
                        message: "fog:" + Date.now()
                    }

                    return self.axios.delete(path, {
                        headers: {
                            'Content-Type': 'application/json;charset=UTF-8'
                        },
                        data: body
                    })
                }).then(function (res) {

                }).finally(function () {
                    delete self.cached[path];
                });
            });
        }, 5, 500);
    }

}