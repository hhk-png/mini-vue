import { ref, shallowRef } from "./ref"
import { Text } from './globalVariable'

export function defineAsyncComponent(options) {

    if (typeof options === 'function') {
        // 如果 options 是加载器，则将其格式化为配置项形式
        options = {
            loader: options
        }
    }

    const { loader } = options

    // 用来存储异步加载的组件
    let InnerComp = null

    let retries = 0
    function load() {
        return loader()
        .catch((err) => {
            if (options.onError) {
                return new Promise((resolve, reject) => {
                    const retry = () => {
                        resolve(load())
                        retries++
                    }
                    const fail = () => reject(err)
                    options.onError(retry, fail, retries)
                })
            } else {
                throw err
            }
        })
    }
    
    return {
        name: 'AsyncComponentWrapper',
        setup() {
            // 异步组件是否加载成功
            const loaded = ref(false)
            // 当错误发生时，用来存储错误对象
            const error = shallowRef(null)
            // 是否正在加载
            const loading = ref(false)

            const loadingTimer = null
            // 如果如果配置项中存在 delay，则开启一个定时器计时，
            //  当延迟到时后将 loading.value 设置为 true
            if (options.delay) {
                loadingTimer = setTimeout(() => {
                    loading.value = true
                }, options.delay)
            } else {
                // 如果配置项中没有delay， 则直接标记为加载中
                loading.value = true
            }
            
            load().then(c => {
                InnerComp = c
                loaded.value = true
            })
            .catch((err) => error.value = err)
            .finally(() => {
                loading.value = false
                clearTimeout(loadingTimer)
            })

            let timer = null
            if (options.timeout) {
                timer = setTimeout(() => {
                    // 超时后创建一个错误对象
                    const err = new Error(`Async component timed out after ${options.timeout}ms.`)
                    error.value = err
                }, options.timeout)
            }

            // 包装组件被卸载时清除定时器
            // onUnmounted(() => clearTimeout(timer))

            const placeholder = {type: Text, children: ''}

            // 如果异步组件加载成功，则渲染该组件，否则渲染一个展位内容
            return () => {
                if (loaded.value) {
                    return { type: InnerComp }
                } else if (error.value && options.errorComponent) {
                    return {type: options.errorComponent, props: {error: error.value}}
                } else if (loading.value && options.loadingComponent) {
                    return {type: options.loadingComponent}
                } else {
                    return placeholder
                }
            }
        }
    }
}
