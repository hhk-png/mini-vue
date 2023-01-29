import { effect } from "./effect"
import { ref } from "./ref"
import { createRenderer, Text, Fragment } from "./createRenderer"


function shouldSetAsProps(el, key, value) {
    if (key === 'form' && el.tagName === 'INPUT') {
        return false
    }
    return key in el
}

const renderer = createRenderer({
    createElement(tag) {
        return document.createElement(tag)
    },
    setElementText(el, text) {
        el.textContent = text
    },
    insert(el, parent, anchor = null) {
        parent.insertBefore(el, anchor)
    },
    createText(text) {
        return document.createTextNode(text)
    },
    setText(el, text) {
        el.nodeValue = text
    },
    patchProps(el, key, prevValue, nextValue) {
        if (/^on/.test(key)) {
            // 绑定事件
            const invokers = el._vei || (el._vei = {})
            // 存储el 的各个事件
            let invoker = invokers[key]
            const name = key.slice(2).toLowerCase()
            if (nextValue) {
                if (!invoker) {
                    // 如果没有invoker，则将一个伪造的invoker 缓存到 el._vei 中
                    invoker = el._vei[key] = (e) => {
                        // 如果事件的发生时间早于事件处理函数绑定的时间，则不会执行事件处理函数
                        if (e.timeStamp < invoker.attached) {
                            return
                        }
                        // 当伪造的事件处理函数执行时，会执行真正的事件处理函数
                        if (Array.isArray(invoker.value)) {
                            invoker.value.forEach(fn => fn(e))
                        } else {
                            invoker.value(e)
                        }
                    }
                    invoker.value = nextValue
                    // 存储事件处理函数被绑定的时间
                    invoker.attached = performance.now()
                    el.addEventListener(name, invoker.value)
                } else {
                    // 更新 invoker.value
                    invoker.value = nextValue
                }
            } else if (invoker) {
                // 新的事件绑定函数不存在，且之前绑定的invoker 存在，则移除绑定
                el.removeEventListener(name, invoker.value)
            }
        } else if (key === 'class') {
            // 对class 做特殊处理
            el.className = nextValue || ''
        } else if (shouldSetAsProps(el, key, nextValue)) {
            // 判断key 是否存在对应的 DOM Properties
            const type = typeof el[key]
            if (type === 'boolean' && value === '') {
                el[key] = true
            } else {
                el[key] = nextValue
            }
        } else {
            // 如果要设置的属性没有对应的 DOM Properties，
            //  则使用 setAttribute 函数设置属性
            el.setAttribute(key, nextValue)
        }
    },
    unmount(vnode) {
        // 判断 VNode 是否需要过渡处理
        const needTransition = vnode.transition
        // Fragment
        if (vnode.type === Fragment) {
            vnode.children.forEach(c => unmount(c))
            return
        } else if (typeof vnode.type === 'object') {
            if (vnode.shouldKeepAlive) {
                // 对于需要被 KeepAlive 的组件，使其失活
                vnode.keepAliveInstance._deActivate(vnode)
            } else {
                unmount(vnode.component.subTree)
            }
            return
        }
        const parent = vnode.el.parentNode
        if (parent) {
            // 将卸载动作封装到 performRemove 函数中
            const performRemove = () => {
                parent.removeChild(vnode.el)
            }
            if (needTransition) {
                vnode.transition.leave(vnode.el, performRemove)
            } else {
                performRemove()
            }
        }
    }
})

const vnode = {
    type: 'button',
    props: {
        id: 'foo',
        onClick: (e) => {
            console.log(e)
            alert('clicked')
        }
    },
    children: [
        {
            type: Text,
            children: 'hello'
        }
    ]
}

const vnodeP = {
    type: 'p'
}

const vnodeInput = {
    type: 'input'
}

effect(() => {
    renderer.render(vnode, document.getElementById('app'))
})

