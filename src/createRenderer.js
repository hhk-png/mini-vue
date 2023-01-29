import { effect, reactive, shallowReactive, shallowReadonly } from "./effect"
import { queueJob } from "./queueJob"

import { Text, Fragment, currentInstance, setCurrentInstance } from './globalVariable'

export function createRenderer(options) {


    const {
        createElement,
        insert,
        setElementText,
        patchProps,
        unmount,
        createText,
        setText
    } = options

    function mountElement(vnode, container, anchor) {
        // 创建元素，将元素添加到容器中
        const el = vnode.el = createElement(vnode.type)

        if (typeof vnode.children === 'string') {
            setElementText(el, vnode.children)
        } else if (Array.isArray(vnode.children)) {
            vnode.children.forEach(child => {
                patch(null, child, el)
            })
        }

        // 属性
        if (vnode.props) {
            for (const key in vnode.props) {
                patchProps(el, key, null, vnode.props[key])
            }
        }

        const needTransition = vnode.transition
        if (needTransition) {
            vnode.transition.beforeEnter(el)
        }

        insert(el, container, anchor)
        if (needTransition) {
            vnode.transition.enter(el)
        }
    }

    function getSequence(arr) {
        const arrCopy = arr.slice()
        // 最长递增子序列的各个索引
        const result = [0]
        const n = arr.length
        for (let i = 0; i < n; i++) {
            // 当前值
            const val = arr[i]
            if (val !== 0) {
                // result 的末尾值
                const j = result[result.length - 1]
                if (arr[j] < val) {
                    arrCopy[i] = j
                    result.push(i)
                    continue
                }
                let left = 0
                let right = result.length - 1
                while (left < right) {
                    const middle = ((left + right) / 2) | 0
                    if (arr[result[middle]] < val) {
                        left = middle + 1
                    } else {
                        right = middle
                    }
                }
                if (val < arr[result[left]]) {
                    if (left > 0) {
                        arrCopy[i] = result[left - 1]
                    }
                    result[left] = i
                }
            }
        }
        let left = result.length
        let right = result[left - 1]
        while (left-- > 0) {
            result[left] = right
            right = arrCopy[right]
        }
        return result
    }

    function patchKeyedChildren(n1, n2, container) {
        const newChildren = n2.children
        const oldChildren = n1.children
        let j = 0
        let oldVNode = oldChildren[j]
        let newVNode = newChildren[j]
        // while 循环向后遍历，直到遇到不同 key 值的节点为止
        while (oldVNode.key === newVNode.key) {
            patch(oldVNode, newVNode, container)
            j++
            oldVNode = oldChildren[j]
            newVNode = newChildren[j]
        }

        let oldEnd = oldChildren.length - 1
        let newEnd = newChildren.length - 1
        oldVNode = oldChildren[oldEnd]
        newVNode = newChildren[newEnd]
        // while 循环从后向前遍历，直到遇到不同 key 值的节点为止
        while (oldVNode.key === newVNode.key) {
            patch(oldVNode, newVNode, container)
            oldEnd--
            newEnd--
            oldVNode = oldChildren[oldEnd]
            newVNode = newChildren[newEnd]
        }

        // 说明 j -> newEnd 之间的节点应作为新节点插入
        if (j > oldEnd && j <= newEnd) {
            const anchorIndex = newEnd + 1
            const anchor = anchorIndex < newChildren.length ? newChildren[anchorIndex].el : null
            // 挂载新节点
            while (j <= newEnd) {
                patch(null, newChildren[j++], container, anchor)
            }
        } else if (j > newEnd && j <= oldEnd) {
            // j -> oldEnd 之间的节点应该被卸载
            while (j <= oldEnd) {
                unmount(oldChildren[j++])
            }
        } else {
            const count = newEnd - j + 1
            const sources = new Array(count)
            sources.fill(-1)
        
            const oldStart = j
            const newStart = j
            let moved = false
            let pos = 0
            
            // 构建索引表
            //  newKey => newIndex
            const keyIndex = {}
            for (let i = newStart; i <= newEnd; i++) {
                keyIndex[newChildren[i].key] = i
            }
            // 代表更新过的节点数量
            let patched = 0
            // 遍历旧的一组子节点中剩余未处理的节点
            for (let i = oldStart; i < oldEnd; i++) {
                oldVNode = oldChildren[i]
                // 如果更新过的节点数量小于等于要更新的节点数量，则执行更新
                if (patched <= count) {
                    // 通过索引表快速找到新的一组子节点中具有相同 key 值的节点位置
                    const k = keyIndex[oldVNode.key]
                    if (typeof k !== 'undefined') {
                        newVNode = newChildren[k]
                        patch(oldVNode, newVNode, container)
                        sources[k - newStart] = i
                        // 判断节点是否需要移动
                        if (k < pos) {
                            moved = true
                        } else {
                            pos = k
                        }
                    } else {
                        unmount(oldVNode)
                    }
                } else {
                    // 如果更新过的节点数量大于需要更新的节点数量，则卸载多余的节点
                    unmount(oldVNode)
                }
            }

            // 如果moved 为真，则需要进行 dom 移动操作
            if (moved) {
                // 计算递增子序列
                const seq = getSequence(sources)
                let s = seq.length - 1
                let i = count - 1
                for (i; i >= 0; i--) {
                    if (sources[i] === -1) {
                        const pos = i + newStart
                        const newVNode = newChildren[pos]
                        const nextPos = pos + 1
                        const anchor = nextPos < newChildren.length
                            ? newChildren[nextPos].el
                            : null
                        patch(null, newVNode, container, anchor)
                    } else if (i !== seq[s]) {
                        const pos = i + newStart
                        const newVNode = newChildren[pos]
                        const nextPos = pos + 1
                        const anchor = nextPos < newChildren.length
                            ? newChildren[nextPos].el
                            : null
                        insert(newVNode.el, container, anchor)
                    } else {
                        s--
                    }
                }
            }
        }
    }

    function patchChildren(n1, n2, container) {
        if (typeof n2.children === 'string') {
            // 只有当旧子节点为一组子节点时，才需要逐个卸载，其他情况下什么都不需要做
            if (Array.isArray(n1.children)) {
                n1.children.forEach(c => unmount(c))
            }
            setElementText(container, n2.children)
        } else if (Array.isArray(n2.children)) {
            // 新旧子节点都是一组子节点，diff 算法
            patchKeyedChildren(n1, n2, container)
        } else {
            // 新节点不存在
            if (Array.isArray(n1.children)) {
                n1.children.forEach(c => unmount(c))
            } else if (typeof n1.children === 'string') {
                setElementText(container, '')
            }
        }
    }

    function patchElement(n1, n2) {
        const el = n2.el = n1.el
        const oldProps = n1.props
        const newProps = n2.props
        // 更新 props
        for (const key in newProps) {
            if (newProps[key] !== oldProps[key]) {
                patchProps(el, key, oldProps[key], newProps[key])
            }
        }
        for (const key in oldProps) {
            if (!(key in oldProps)) {
                patchProps(el, key, oldProps[key], null)
            }
        }

        // 更新children
        patchChildren(n1, n2, el)
    }

    // 当前组件的props，传递过来的props
    function resolveProps(options, propsData) {
        const props = {}
        const attrs = {}
        for (const key in propsData) {
            // 以字符串 on 开头的 props，无论是否显式地声明，
            //  都将其添加到 props 数据中，而不是添加到 attrs 中
            if (key in options || key.startsWith('on')) {
                // 如果为组件传递的 props 数据在组件自身的 props 选项中有定义
                //  则将其视为合法的 props
                props[key] = propsData[key]
            } else {
                // 否则将其作为 attrs
                attrs[key] = propsData[key]
            }
        }

        return [props, attrs]
    }

    // 挂载组件
    function mountComponent(vnode, container, anchor) {
        const isFunctional = typeof vnode.type === 'function'

        const componentOptions = vnode.type
        if (isFunctional) {
            // 如果是函数式组件，则将 vnode.type 作为渲染函数，
            //  将 vnode.type.props 作为 props 选项定义即可
            componentOptions = {
                render: vnode.type,
                props: vnode.type.props
            }
        }
        const { render, data, setup, props: propsOption,
            beforeCreate, created, beforeMount, 
            mounted, beforeUpdate, updated } = componentOptions
        
        // beforeCreate 钩子
        beforeCreate && beforeCreate()

        // 调用data 函数得到原始数据，并调用 reactive 函数将其包装为响应式数据
        const state = data ? reactive(data()) : null
        const [props, attrs] = resolveProps(propsOption, vnode.props)
        
        // 直接使用编译好的 vnode.children 对象作为slots 对象即可
        const slots = vnode.children || {}
        
        // 定义组件实例，包含与组件有关的状态信息
        const instance = {
            // data
            state,
            props: shallowReactive(props),
            isMounted: false,
            subTree: null,
            slots,
            // 在组件实例中添加mounted 数组，用来存储通过onMounted 函数注册的生命周期函数
            mounted: [],
            // 只有 KeepAlive 组件的实例下会有 keepAliveCtx 属性
            keepAliveCtx: null
        }

        // 检测是否是keepalive 组件
        const isKeepAlive = vnode.type.__isKeepAlive
        if (isKeepAlive) {
            instance.keepAliveCtx = {
                move(vnode, container, anchor) {
                    insert(vnode.component.subTree.el, container, anchor)
                },
                createElement
            }
        }

        function onMounted(fn) {
            if (currentInstance) {
                currentInstance.mounted.push(fn)
            } else {
                console.error('onMounted 函数只能在 setup 函数中调用')
            }
        }

        // 自定义事件
        function emit(event, ...payload) {
            const eventName = `on${event[0].toUpperCase() + event.slice(1)}`
            // 根据处理后的事件名称去 props 中寻找对应的事件处理函数
            const handler = instance.props[eventName]
            if (handler) {
                handler(...payload)
            } else {
                console.error('事件不存在')
            }
        }

        // setup
        // setupContext
        const setupContext = { attrs, emit, slots, onMounted }
        // setup 函数调用之前，设置当前组件实例
        setCurrentInstance(instance)
        // 执行 setup 函数
        const setupResult = setup(shallowReadonly(instance.props), setupContext)
        setCurrentInstance(null)
        // 存储由 setup 返回的数据
        let setupState = null
        // 如果 setup 函数的返回值是函数，则将其作为渲染函数
        if (typeof setupResult === 'function') {
            if (render) {
                console.error('setup 函数返回渲染函数，render 选项将被忽略')
            }
            render = setupResult
        } else {
            // 如果 setup 的返回值不是函数，则作为数据状态赋值给 setupState
            setupState = setupResult
        }

        // 将组件实例设置到 vnode 上，用于后续个更新
        vnode.component = instance

        // 创建渲染上下文对象，本质上是组件实例的代理
        const renderContext = new Proxy(instance, {
            get(target, key, receiver) {
                const { state, props, slots } = target
                // 当 key 的值为 $slots 时，直接返回组件实例上的 slots
                if (key === '$slots') {
                    return slots
                }
                if (state && key in state) {
                    return state[key]
                } else if (key in props) {
                    return props[key]
                } else if (setupState && key in setupState) {
                    return setupState[key]
                } else {
                    console.error('不存在')
                }
            },
            set(target, key, value, receiver) {
                const { state, props } = target
                if (state && key in props) {
                    state[key] = value
                } else if (key in props) {
                    console.warn(`Attempting to mutate prop "${k}". Props are readonly.`)
                } else if (setupState && key in setupState) {
                    setupState[key] = value
                }  else {
                    console.error('不存在')
                }
            }
        })

        // created 钩子
        //  生命周期函数调用时要绑定渲染上下文
        created && created.call(renderContext)

        // 当组件自身状态发生变化时，我们需要有能力触发组件更新，即软件的自更新
        effect(() => {
            // 执行渲染函数，获取组件要渲染的内容，即render 函数返回的虚拟DOM
            //  将其 this 设置为 state
            const subTree = render.call(state, state)
            if (!instance.isMounted) {
                // beforeMount 钩子
                beforeMount && beforeMount.call(state)
                patch(null, subTree, container, anchor)
                // 将组件实例的 isMounted 设置为 true，
                //  这样当更新发生时就不会再次进行挂载操作，而是会执行更新
                instance.isMounted = true
                // mounted 钩子
                mounted && mounted.call(state)
                instance.mounted && instance.mounted.forEach(hook => hook.call(renderContext))
            } else {
                // beforeUpdate 钩子
                beforeUpdate && beforeUpdate.call(state)
                // 更新操作
                //  使用新的子树与上一次渲染的子树进行打补丁操作
                patch(instance.subTree, subTree, container, anchor)
                // updated 钩子
                updated && updated.call(state)
            }
            // 更新组件实例的子树
            instance.subTree = subTree
        }, {
            // 指定该副作用函数的调度器为 queueJob 即可
            scheduler: queueJob
        })
    }

    function hasPropsChanged(prevProps, nextProps) {
        const nextKeys = Object.keys(nextProps)
        // 数量发生变化，说明有变化
        if (nextKeys.length !== Object.keys(prevProps).length) {
            return true
        }
        for (let i = 0; i < nextKeys.length; i++) {
            const key = nextKeys[i]
            // 有不相等的 props，则说明有变化
            if (nextKeys[key] !== prevProps[key]) {
                return true
            }
        }
        return false
    }

    function patchComponent(n1, n2, anchor) {
        const instance = (n2.component = n1.component)
        // 当前的 props
        const { props } = instance
        if (hasPropsChanged(n1.props, n2.props)) {
            const [ nextProps ] = resolveProps(n2.type.props, n2.props)
        
            // 更新props
            for (const key in nextProps) {
                props[key] = nextProps[key]
            }
            // 删除不存在的props
            for (const key in props) {
                if (!(key in nextProps)) {
                    delete props[key]
                }
            }
        }
    }

    function patch(n1, n2, container, anchor) {
        // 如果n1 存在，则对比n1 和n2 的类型
        if (n1 && n1.type !== n2.type) {
            unmount(n1)
            // 保证后续挂载操作正常执行
            n1 = null
        }

        // n1 和 n2 所描述的内容相同
        const { type } = n2
        // 如果type 的类型是字符串，则它描述的是普通标签元素
        if (typeof type === 'string') {
            if (!n1) {
                // n1 不存在 挂载
                mountElement(n2, container)
            } else {
                // n1 存在 打补丁
                patchElement(n1, n2)
            }
        } else if (type === Text) {
            // 文本节点
            if (!n1) {
                const el = n2.el = createText(n2.children)
                insert(el, container)
            } else {
                const el = n2.el = n1.el
                if (n2.children !== n1.children) {
                    setText(el, n2.children)
                }
            }
        } else if (type === Fragment) {
            // Fragment
            if (!n1) {
                n2.children.forEach(c => patch(null, c, container))
            } else {
                patchChildren(n1, n2, container)
            }
        } else if (typeof type === 'object' && type.__isTeleport) {
            type.process(n1, n2, container, anchor, {
                patch,
                patchChildren,
                unmount,
                move(vnode, container, anchor) {
                    insert(
                        vnode.component
                            // 移动一个组件
                            ? vnode.component.subTree.el
                            // 移动普通元素
                            : vnode.el,
                        container,
                        anchor
                    )
                }
            })
        } else if (typeof type === 'object' || typeof type === 'function') {
            // 如果是对象，则是组件
            if (!n1) {
                if (n2.keptAlive) {
                    n2.keepAliveInstance._activate(n2, container, anchor)
                } else {
                    // 挂载组件
                    mountComponent(n2, container, anchor)
                }
            } else {
                // 更新组件
                patchComponent(n1, n2, anchor)
            }
        } else if (type === 'xxx') {

        }

    }

    function render(vnode, container) {
        if (vnode) {
            patch(container._vnode, vnode, container)
        } else {
            // 当卸载操作发生的时候，
            //  只需要根据虚拟节点对象 vnode.el 取得真实 DOM 元素，
            //  再将其从父元素中移除即可：
            if (container._vnode) {
                unmount(container._vnode)
            }
        }
        container._vnode = vnode
    }

    function hydrate(vnode, container) {

    }

    return {
        render,
        hydrate
    }
}





