import { IStorage } from "../storage";
import Axios from "axios"
import { AxiosInstance } from 'axios'
import FormData from "form-data"
import qs from "query-string"
import { Parallelizer } from "../parallelizer"
import { retry } from "../retry"
import { v4 as UUIDV4 } from "uuid"
import { FullSaver } from "../isaver";
import { logger } from "../../logger";
export interface GiteeConfigure {
    access_token: string,
    owner: string,
    repo: string,
    branch: string,
    root: string
}
interface GiteeAPIResource {
    name: string,
    path: string,
    type: "dir" | "file",
    size: number,
    sha: string,
    url: string,
    content: string | undefined | null,
    encoding: "base64" | undefined | null
}
export class GiteeStorage extends FullSaver implements IStorage {
    axios: AxiosInstance = Axios.create()
    configure: GiteeConfigure
    cached: {
        [path: string]: {
            sha: string
            timer: NodeJS.Timeout
        }
    } = {}
    parallelizer: Parallelizer = new Parallelizer(1)
    private _id: string = "";
    constructor(public access_token: string, public owner: string, public repo: string, public branch?: string, root?: string) {
        super();
        this.configure = {
            access_token: access_token,
            owner: owner,
            repo: repo,
            branch: branch || "master",
            root: root || "/"
        };
    }

    protected _saver_write(content: string): Promise<void | undefined> {
        return this.save(Buffer.from(content, "utf8"), "inodes.json").then(() => { })
    }
    protected _saver_read(): Promise<string | undefined> {
        return this.read("inodes.json").then(buffer => {
            return buffer.toString("utf8");
        }).catch(e => {
            if (e.message === "NotFound" || e.message === "NotBlockFile") {
                return JSON.stringify({ timestamp: 0, inodes: {} })
            }
            throw e;
        })
    }

    get type(): string {
        return "gitee"
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
        let path = this.configure.root + ".fog";

        try {
            let file = await this.getFile(path);
            if (file.encoding === "base64" && file.type === "file") {
                let content = Buffer.from(file.content as string, "base64").toString("utf8");
                try {
                    let fog = JSON.parse(content);
                    this._id = fog.id;
                }
                catch (e) {

                }
            }
        }
        catch (e: any) {
            if (e.message !== "NotBlockFile") {
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

    private getFile(path: string): Promise<GiteeAPIResource> {
        let self = this;

        return this.axios.get(`https://gitee.com/api/v5/repos/${self.configure.owner}/${self.configure.repo}/contents${path}?ref=${self.configure.branch}&access_token=${self.configure.access_token}`, {
            responseType: "json"
        })
            .then(function (res) {

                let body: GiteeAPIResource;
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
                        encoding: item.encoding
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
            })

    }
    private getSha(path: string): Promise<string | undefined> {
        if (this.cached[path]) return Promise.resolve(this.cached[path].sha);
        return this.getFile(path).then(function (body) {
            return body.sha;
        }).catch(function (e) {
            if (e.message === "NotBlockFile") return undefined;
            throw e;
        }).then(function (sha) {
            return sha;
        });
    }
    read(content: string): Promise<Buffer> {
        let self = this;
        let path = this.configure.root + content;
        return retry(function () {
            return self.parallelizer.execute(function () {

                return self.getFile(path).then(function (body) {
                    if (body.type !== "file") throw new Error("NotBlockFile");
                    if (body.encoding !== "base64") throw new Error("NotBase64");
                    return Buffer.from(body.content as string, "base64");
                });
            });
        }, 5, 500).then((buffer: Buffer) => {
            return Buffer.from(buffer.toString("utf8"), "base64");
        });
    }

    save(buffer: Buffer, origin?: string | undefined): Promise<string> {
        buffer = Buffer.from(buffer.toString("base64"), "utf8");
        let content = buffer.toString("base64");
        let path = this.configure.root;
        let fileName = origin;
        if (!fileName) {
            fileName = UUIDV4();
        }
        path = path + fileName;
        let url = `https://gitee.com/api/v5/repos/${this.configure.owner}/${this.configure.repo}/contents${path}`

        let self = this;
        return retry(function () {
            return self.parallelizer.execute(function () {
                return self.getSha(path).then(function (sha: string | undefined): Promise<any> {
                    let body: FormData = new FormData();
                    body.append("access_token", self.configure.access_token);
                    body.append("content", content);

                    body.append("message", "fog:" + Date.now());
                    body.append("branch", self.configure.branch);
                    if (sha) {
                        body.append("sha", sha);
                        return self.axios.put(url, body)
                    }

                    return self.axios.post(url, body)
                }).then(() => {
                    return fileName;
                }).catch(e => {
                    logger.debug(e);
                    throw e;
                }).finally(function () {
                    delete self.cached[path];
                });
            });
        }, 5, 500);
    }
    delete(content: string): Promise<void> {
        let self = this;
        let path = this.configure.root + content;
        return retry(function () {
            return self.parallelizer.execute(function () {

                return self.getSha(path).then(function (sha: string | undefined): Promise<any> {
                    if (!sha) return Promise.resolve();
                    let query = {
                        access_token: self.configure.access_token,
                        sha: sha,
                        message: "fog:" + Date.now(),
                        branch: self.configure.branch
                    }
                    return self.axios.delete(`https://gitee.com/api/v5/repos/${self.configure.owner}/${self.configure.repo}/contents${path}?${qs.stringify(query)}`, {
                        headers: {
                            'Content-Type': 'application/json;charset=UTF-8'
                        }
                    })
                }).then(function (res) {

                }).finally(function () {
                    delete self.cached[path];
                });
            });
        }, 5, 500);
    }
}