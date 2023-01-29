const Transition = {
    name: 'Transition',
    setup(props, {slots}) {
        return () => {
            const innerVNode = slots.default()
            innerVNode.transition = {
                beforeEnter(el) {
                    el.classList.add('enter-from')
                    el.classList.add('enter-active')
                },
                enter(el) {
                    requestAnimationFrame(() => {
                        el.classList.remove('enter-from')
                        el.classList.add('enter-to')
                        // 监听 transitionend 事件
                        el.addEventListener('transitionend', () => {
                            el.classList.remove('enter-to')
                            el.classList.remove('enter-active')
                        })
                    })
                },
                leave(el, performRemove) {
                    el.classList.add('leave-from')
                    el.classList.add('leave-active')
                    // 强制reflow，使得初始状态生效
                    document.body.offsetHeight
                    requestAnimationFrame(() => {
                        el.classList.remove('leave-from')
                        el.classList.add('leave-to')
                        el.addEventListener('transitionend', () => {
                            el.classList.remove('leave-to')
                            el.classList.remove('leave-active')
                            performRemove()
                        })
                    })
                }
            }

            return innerVNode
        }
    }
}