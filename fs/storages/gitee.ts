import { IZseaStorage } from "../ZseaFileSystem";
import Axios from "axios"
import {AxiosInstance} from 'axios'
import FormData from "form-data"
import qs from "query-string"
import { Parallelizer } from "../parallelizer"
import { retry } from "../retry"

export interface GiteeConfigure {
    access_token: string,
    owner: string,
    repo: string,
    branch: string
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
export class GiteeStorage implements IZseaStorage {
    axios:AxiosInstance = Axios.create()
    configure: GiteeConfigure
    cached: {
        [path: string]: {
            sha: string
            timer: NodeJS.Timeout
        }
    } = {}
    parallelizer: Parallelizer = new Parallelizer(1)
    constructor(public access_token: string, public owner: string, public repo: string, public branch?: string) {
        this.configure = {
            access_token: access_token,
            owner: owner,
            repo: repo,
            branch: branch || "master"
        };
    }
    private getFile(path: string): Promise<GiteeAPIResource> {
        let self = this;

        return this.axios.get(`https://gitee.com/api/v5/repos/${self.configure.owner}/${self.configure.repo}/contents${path}?ref=${self.configure.branch}&access_token=${self.configure.access_token}`)
            .then(function (res) {
                //console.log(path,res);
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
    read(path: string, cancel: () => boolean): Promise<Buffer> {
        let self = this;
        return retry(function () {
            return self.parallelizer.execute(function () {
                if (cancel()) throw { error: new Error("Canceled"), disable: true };
                return self.getFile(path).then(function (body) {
                    if (body.type !== "file") throw new Error("NotBlockFile");
                    if (body.encoding !== "base64") throw new Error("NotBase64");
                    return Buffer.from(body.content as string, "base64");
                });
            });
        }, 5, 500);
    }

    save(path: string, buffer: Buffer, cancel: () => boolean): Promise<void> {
        let content = buffer.toString("base64");
        let url = `https://gitee.com/api/v5/repos/${this.configure.owner}/${this.configure.repo}/contents${path}`

        let self = this;
        return retry(function () {
            return self.parallelizer.execute(function () {
                if (cancel()) throw { error: new Error("Canceled"), disable: true };
                return self.getSha(path).then(function (sha: string | undefined): Promise<any> {
                    let body: FormData = new FormData();
                    body.append("access_token", self.configure.access_token);
                    body.append("content", content);

                    body.append("message", "zfs:" + Date.now());
                    body.append("branch", self.configure.branch);
                    if (sha) {
                        body.append("sha", sha);
                        return self.axios.put(url, body)
                    }

                    return self.axios.post(url, body)
                }).finally(function () {
                    delete self.cached[path];
                });
            });
        }, 5, 500);
    }
    delete(path: string, cancel: () => boolean): Promise<void> {
        let self = this;
        return retry(function () {
            return self.parallelizer.execute(function () {
                if (cancel()) throw { error: new Error("Canceled"), disable: true };
                return self.getSha(path).then(function (sha: string | undefined): Promise<any> {
                    if (!sha) return Promise.resolve();
                    let query = {
                        access_token: self.configure.access_token,
                        sha: sha,
                        message: "zfs:" + Date.now(),
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