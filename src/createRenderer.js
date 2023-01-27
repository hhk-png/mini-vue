
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





