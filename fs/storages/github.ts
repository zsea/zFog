import { IZseaStorage } from "../ZseaFileSystem";
import Axios from 'axios'
import { Parallelizer } from "../parallelizer"
import { retry } from "../retry"

export interface GithubConfigure {
    access_token: string,
    owner: string,
    repo: string,
    branch: string
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
export class GithubStorage implements IZseaStorage {
    axios = Axios.create({
        baseURL: `https://api.github.com/repos/${this.owner}/${this.repo}/contents`,
        headers: {
            "Authorization": `token ${this.access_token}`,
            "Accept": "application/vnd.github+json"
        }
    });
    constructor(private access_token: string, private owner: string, private repo: string, private branch: string = "main") {
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
                    //console.log(item);
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
                console.log(e);
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
    read(path: string, cancel: () => boolean): Promise<Buffer> {
        let self = this;
        return retry(function () {
            return self.parallelizer.execute(function () {
                if (cancel()) throw { error: new Error("Canceled"), disable: true };
                return self.getFile(path).then(function (body) {
                    //console.log(body);
                    if (body.type !== "file") throw new Error("NotBlockFile");
                    if (body.encoding === "base64") {
                        // throw new Error("NotBase64");
                        return Buffer.from(body.content as string, "base64");
                    }
                    if (body.encoding === "none") {
                        let download_url = body.download_url;
                        if (!download_url) throw new Error("NotFound");
                        return self.axios.get(download_url).then(function (res) {
                            return res.data
                        })
                    }
                    throw new Error("NotBlockFile");
                }).catch(function (e) {
                    if (e.message === "NotBlockFile" || e.message === "NotBase64" || e.message === "NotFound" || e.message === "Forbidden") {
                        throw { error: e, disable: true };
                    }
                    throw e;
                });
            });
        }, 5, 500);
    }
    save(path: string, buffer: Buffer, cancel: () => boolean): Promise<void> {
        let content = buffer.toString("base64");
        //let url = `${path}`

        let self = this;
        return retry(function () {
            return self.parallelizer.execute(function () {
                if (cancel()) throw { error: new Error("Canceled"), disable: true };
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
                        message: "zfs:" + Date.now()
                    }
                    if (sha) {
                        body["sha"] = sha;

                    }

                    return self.axios.put(path, body)
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
                    let body = {
                        branch: self.branch,
                        sha: sha,
                        message: "zfs:" + Date.now()
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