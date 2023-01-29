import { reactive, shallowReactive } from "./effect"

export function ref(val) {
    const wrapper = {
        value: val
    }
    Object.defineProperty(wrapper, '__v_isRef', {
        value: true
    })

    return reactive(wrapper)
}

export function shallowRef(val) {
    const wrapper = {
        value: val
    }
    Object.defineProperty(wrapper, '__v_isRef', {
        value: true
    })

    return shallowReactive(wrapper)
}

export function toRef(obj, key) {
    const wrapper = {
        get value() {
            return obj[key]
        },
        set value(val) {
            obj[key] = val
        }
    }
    Object.defineProperty(wrapper, '__v_isRef', {
        value: true
    })

    return wrapper
}

export function toRefs(obj) {
    const res = {}
    for (const key in obj) {
        res[key] = toRef(obj, key)
    }
    
    return res
}

export function proxyRefs(target) {
    return new Proxy(target, {
        get(target, key, receiver) {
            const value = Reflect.get(target, key, receiver)
            // 自动脱 ref 实现
            return value.__v_isRef ? value.value : value
        },
        set(target, key, newValue, receiver) {
            const value = target[key]
            if (value.__v_isRef) {
                value.value = newValue
                return true
            }
            return Reflect.set(target, key, newValue, receiver)
        }
    })
}

