
// 文本节点的 type 标识
export const Text = Symbol()
// Fragment
export const Fragment = Symbol()

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

    function mountElement(vnode, container) {
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

        insert(el, container)
    }

    function patchChildren(n1, n2, container) {
        if (typeof n2.children === 'string') {
            // 只有当旧子节点为一组子节点时，才需要逐个卸载，其他情况下什么都不需要做
            if (Array.isArray(n1.children)) {
                n1.children.forEach(c => unmount(c))
            }
            setElementText(container, n2.children)
        } else if (Array.isArray(n2.children)) {
            if (Array.isArray(n1.children)) {
                // 新旧子节点都是一组子节点，diff 算法
                n1.children.forEach(c => unmount(c))
                n2.children.forEach(c => patch(null, c, container))
            } else {
                // 要么是文本节点，要么不存在
                //  无论哪种情况，我们都只需要将容器清空，然后将新的一组子节点逐个挂载
                setElementText(container, '')
                n2.children.forEach(c => patch(null, c, container))
            }
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

    function patch(n1, n2, container) {
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
        } else if (typeof type === 'object') {
            // 如果是对象，则是组件
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





