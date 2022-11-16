import { v2 as webdav } from 'webdav-server'
export interface user {
    username: string,
    password: string,
    rights?: {
        [path: string]: string[] | null | undefined
    }
}
export interface authentication {
    type?: "basic" | "digest" | "none"
    realm?:string
    users?: user[]
}
export function createAuthentication(auth?: authentication): { authentication?: webdav.HTTPAuthentication, privilege?: webdav.PrivilegeManager } | undefined | void {
    //console.log(auth);
    if (!auth) return;
    if (!auth.type || auth.type === "none") return;
    let httpAuthentication: webdav.HTTPAuthentication;
    let userManager: webdav.SimpleUserManager = new webdav.SimpleUserManager();
    let privilegeManager: webdav.SimplePathPrivilegeManager = new webdav.SimplePathPrivilegeManager();
    if (auth.users) {
        auth.users.forEach(u => {
            let user = userManager.addUser(u.username, u.password, false);
            if (u.rights) {
                for (let path in u.rights) {
                    privilegeManager.setRights(user, path, u.rights[path] || ['all']);
                }
            }
            else {
                privilegeManager.setRights(user, "/", ['all']);
            }
        })
    }
    
    switch(auth.type){
        case "basic":{
            httpAuthentication=new webdav.HTTPBasicAuthentication(userManager,auth.realm);
            break;
        }
        case "digest":{
            httpAuthentication=new webdav.HTTPDigestAuthentication(userManager,auth.realm)
            break;
        }
        default:{
            return;
        }
    }
    return {
        authentication:httpAuthentication,
        privilege:privilegeManager
    }
}
