// 文本节点的 type 标识
export const Text = Symbol()
// Fragment
export const Fragment = Symbol()

// 全局变量，存储当前正在被初始化的组件实例
export const currentInstance = null

export function setCurrentInstance(instance) {
    currentInstance = instance
}

// effect
export const ITERATE_KEY = Symbol()
export const MAP_KEY_ITERATE_KEY = Symbol()
export const TriggerType = {
    SET: 'SET',
    ADD: 'ADD',
    DELETE: 'DELETE'
}

