
export interface TaskItem {
    task: ((index:number) => any),
    completed: ((e: any, result: any) => any)
}
export class Parallelizer {
    private queue: TaskItem[] = [];
    private waitor: ((p: any) => void)[] = [];
    private isRuning = true;

    private onPush(): void {
        let waitor = this.waitor.shift();
        if (waitor) {
            waitor(undefined);
        }
    }
    private async taskHandler(index: number): Promise<void> {
        while (this.isRuning) {
            let task = this.queue.shift();
            if (task) {
                
                await Promise.resolve(task && task.task(index)).then(function (result: any) {
                    task?.completed(undefined, result);
                }).catch(function (e: any) {
                    task?.completed(e, undefined);
                });
            }
            else{
                await new Promise((resolve)=>{
                    this.waitor.push(resolve)
                });
            }
            //await waiting;
        }
    }
    public execute(f: (index?:number) => any): Promise<any> {
        let self = this;
        return new Promise<any>(function (resolve, reject) {
            self.queue.push({
                task: f,
                completed: function (e: any, result: any) {
                    if (e) {
                        reject(e)
                    }
                    else {
                        resolve(result);
                    }
                }
            });
            self.onPush();
        })

    }

    constructor(maxTasks: number = 1) {
        for (let i = 0; i < maxTasks; i++) {
            this.taskHandler(i);
        }
    }
    public stop(){
        this.isRuning=false;
    }
}
