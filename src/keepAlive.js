import { currentInstance } from "./globalVariable"

const KeepAlive = {
    __isKeepAlive: true,
    props: {
        include: RegExp,
        exclude: RegExp
    },
    setup(props, {slots}) {
        const cache = new Map()
        // 当前 KeepAlive 组件实例
        const instance = currentInstance
        // 该对象会暴露渲染器的一些内部方法
        //  move 函数用来将一段 DOM 移动到另一个容器中
        const {move, createElement} = instance.keepAliveCtx
        
        // 隐藏容器
        const storageContainer = createElement('div')
        // 这两个函数会在渲染器中被调用
        instance._deActivate = (vnode) => {
            move(vnode, storageContainer)
        }
        instance._activate = (vnode, container, anchor) => {
            move(vnode, container, anchor)
        }

        return () => {
            // KeepAlive 的默认插槽就是要被 KeepAlive 的组件
            let rawVNode = slots.default()
            // 如果不是组件，直接渲染即可，因为非组件的虚拟节点无法被 KeepAlive
            if (typeof rawVNode.type !== 'object') {
                return rawVNode
            }

            const name = rawVNode.type.name
            if (
                name && 
                (
                    (props.include && !props.include.test(name)) ||
                    (props.exclude && props.exclude.test(name))
                ) 
            ) {
                // 直接渲染内部组件，不对其进行后续的缓存操作
                return rawVNode
            }

            const cachedVNode = cache.get(rawVNode.type)
            if (cachedVNode) {
                // 如果有缓存的内容，则说明不应该执行挂载，而应该执行激活
                rawVNode.component = cachedVNode.component
                // 避免渲染器重新挂载它
                rawVNode.keptAlive = true
            } else {
                cache.set(rawVNode.type, rawVNode)
            }

            // 避免渲染器将组件卸载
            rawVNode.shouldKeepAlive = true
            // 将 KeepAlive 组件的实例也添加到 vnode 上，以便在渲染器中访问
            rawVNode.keepAliveInstance = instance
            return rawVNode
        }
    }
}