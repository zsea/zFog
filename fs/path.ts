

export default {
    basename: (path:string,ext?:string):string => { 
        let name=path.replace(/^.*\//ig,'');
        if(ext){
            if(name.endsWith(ext)){
                name=name.substring(0,name.length-ext.length)
            }
        }
        return name;
    },
    join: (paths: string[]): string => {
        let nPath: string | undefined = undefined;
        for (let i = 0; i < paths.length; i++) {
            if (!paths[i].length) continue;
            if (!nPath) {
                nPath = paths[i];
                continue;
            }
            if (!nPath.endsWith("/")) nPath += "/";
            let sep = paths[i].replace(/^\/+/ig, '');
            nPath += sep;
        }
        return nPath || "/"
    }
}