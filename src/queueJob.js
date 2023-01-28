
// 无论对响应式数据进行多少次修改，副作用函数都只会重新执行一次

const queue = new Set()
// 代表是否正在刷新任务队列
let isFlushing = false
const p = Promise.resolve()

export function queueJob(job) {
    queue.add(job)
    // 如果还没有开始刷新队列，则刷新
    if (!isFlushing) {
        isFlushing = true
        // 在微任务中刷新缓冲队列，函数放进的都是同一个 promise
        p.then(() => {
            try {
                queue.forEach(job => job())
            } finally {
                // 
                isFlushing = false
                queue.clear = 0
            }
        })
    }
}

