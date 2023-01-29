import { TriggerType, ITERATE_KEY, MAP_KEY_ITERATE_KEY } from "./globalVariable"

const bucket = new WeakMap()
const log = console.log
let activeEffect
const effectStack = []
// 定义一个 Map 实例，存储原始对象到代理对象的映射
const reactiveMap = new Map()
const arrayInstrumentations = {}
;['includes', 'indexOf', 'lastIndexOf'].forEach(method => {
    const originMethod = Array.prototype[method]
    arrayInstrumentations[method] = function(...args) {
        // this 是代理对象，先在代理对象中查找，将结果存储到 res 中
        let res = originMethod.apply(this, args)

        // res 为false 说明没找到，通过this.raw 拿到原始数组，
        //  再去其中查找并更新res 值
        if (res === false || res === -1) {
            res = originMethod.apply(this.raw, args)
        }

        return res
    }
})
// 代表是否进行追踪
let shouleTrack = true
// 数组中的方法会隐式的读取数组的length 属性，length 属性会与副作用函数之间建立联系
;['push', 'pop', 'shift', 'unshift', 'splice'].forEach(method => {
    const originMethod = Array.prototype[method]
    // 重写
    arrayInstrumentations[method] = function(...args) {
        shouleTrack = false
        let res = originMethod.apply(this, args)
        shouleTrack = true
        return res
    }
})

const mutableInstrumentations = {
    add(key) {
        const target = this.raw
        const hadKey = target.has(key)
        const res = target.add(key)
        if (!hadKey) {
            trigger(target, key, TriggerType.ADD)
        }
        return res
    },
    delete(key) {
        const target = this.raw
        const hadKey = target.delete(key)
        if (hadKey) {
            trigger(target, key, TriggerType.DELETE)
        }
        return res
    },
    get(key) {
        const target = this.raw
        const hadKey = target.has(key)
        track(target, key)
        if (hadKey) {
            const res = target.get(key)
            return typeof res === 'object' ? reactive(res) : res
        }
    },
    set(key, value) {
        const target = this.raw
        const hadKey = target.has(key)
        const oldValue = target.get(key)
        const rawValue = value.raw || value
        target.set(key, rawValue)
        if (!hadKey) {
            trigger(target, key, TriggerType.ADD)
        } else if (oldValue !== value || (oldValue === oldValue && value === value)) {
            trigger(target, key, TriggerType.SET)
        }
    },
    forEach(callback, thisArg) {
        const wrap = (val) => typeof val === 'object' ? reactive(val) : val
        const target = this.raw
        track(target, ITERATE_KEY)
        target.forEach((v, k) => {
            callback.call(thisArg, wrap(v), wrap(k), this)
        })
    },
    [Symbol.iterator]: iteratationMethod,
    entries: iteratationMethod,
    values: valuesIteratationMethod,
    keys: keysIterationMethod
}

function keysIterationMethod() {
    const target = this.raw
    const itr = target.keys()
    const wrap = (val) => typeof val === 'object' ? reactive(val) : val
    track(target, MAP_KEY_ITERATE_KEY)
    
    return {
        next() {
            const {value, done} = itr.next()
            return {
                value: wrap(value),
                done
            }
        },
        [Symbol.iterator]() {
            return this
        }
    }
}

function valuesIteratationMethod() {
    const target = this.raw
    const itr = target.values
    const wrap = (val) => typeof val === 'object' ? reactive(val) : val
    track(target, ITERATE_KEY)
    
    return {
        next() {
            const {value, done} = itr.next()
            return {
                value: wrap(value),
                done
            }
        },
        [Symbol.iterator]() {
            return this
        }
    }
}

function iteratationMethod() {
    const target = this.raw
    const itr = target[Symbol.iterator]()
    const wrap = (val) => typeof val === 'object' && val !== null ? reactive(val) : val
    track(target, ITERATE_KEY)
    return {
        next() {
            const {value, done} = itr.next()
            return {
                value: value ? [wrap(value[0]), wrap(value[1])] : value,
                done
            }
        },
        [Symbol.iterator]() {
            return this
        }
    }
}

export function track(target, key) {
    // 当禁止追踪时，直接返回
    if (!activeEffect || !shouleTrack) {
        return
    }
    let depsMap = bucket.get(target)
    if (!depsMap) {
        bucket.set(target, (depsMap = new Map()))
    }
    let deps = depsMap.get(key)
    if (!deps) {
        depsMap.set(key, (deps = new Set()))
    }
    deps.add(activeEffect)
    activeEffect.deps.push(deps)
}

function trigger(target, key, type, newVal) {
    const depsMap = bucket.get(target)
    if (!depsMap) {
        return
    }
    const effects = depsMap.get(key)

    const effectsToRun = new Set()
    effects && effects.forEach(effectFn => {
        if (effectFn !== activeEffect) {
            effectsToRun.add(effectFn)
        }
    })

    if (
        (type === TriggerType.ADD || type === TriggerType.DELETE)
        && Object.prototype.toString.call(target) === '[object Map]'
    ) {
        const iterateEffects = depsMap.get(MAP_KEY_ITERATE_KEY)
        iterateEffects && iterateEffects.forEach(effectFn => {
            if (effectFn !== activeEffect) {
                effectsToRun.add(effectFn)
            }
        })
    }

    if (
        type === TriggerType.ADD 
        || type === TriggerType.DELETE
        // 如果操作类型是 SET，并且目标对象是 Map 类型的数据，
        //  也应该触发那些与 ITERATE_KEY 相关联的副作用函数重新执行
        || (
            type === TriggerType.SET 
            && Object.prototype.toString.call(target) === '[object Map]'
        )
    ) {
        const iterateEffects = depsMap.get(ITERATE_KEY)
        iterateEffects && iterateEffects.forEach(effectFn => {
            if (effectFn !== activeEffect) {
                effectsToRun.add(effectFn)
            }
        })
    }

    // 当操作类型为 ADD 并且目标对象是数组时，
    //  应该取出并执行那些与length 属性相关的副作用函数
    if (type === TriggerType.ADD && Array.isArray(target)) {
        const lengthEffects = depsMap.get('length')
        lengthEffects && lengthEffects.forEach(effectFn => {
            if (effectFn !== activeEffect) {
                effectsToRun.add(effectFn)
            }
        })
    }

    // 如果操作目标是数组，并且修改了数组的 length 属性
    if (Array.isArray(target) && key === 'length') {
        // 对于索引大于或等于新的length 值的元素
        //  需要把所有相关联的副作用函数取出并添加到
        depsMap.forEach((effects, key) => {
            if (key >= newVal) {
                effects.forEach(effectFn => {
                    if (effectFn !== activeEffect) {
                        effectsToRun.add(effectFn)
                    }
                })
            }
        })
    }

    effectsToRun.forEach(effectFn => {
        if (effectFn.options.scheduler) {
            effectFn.options.scheduler(effectFn)
        } else {
            effectFn()
        }
    })
}

export function effect(fn, options = {}) {
    const effectFn = () => {
        cleanup(effectFn)
        activeEffect = effectFn
        effectStack.push(effectFn)
        const res = fn()
        effectStack.pop()
        activeEffect = effectStack[effectStack.length - 1]
        return res
    }
    effectFn.options = options
    effectFn.deps = []
    if (!options.lazy) {
        effectFn()
    }
    return effectFn
}

function cleanup(effectFn) {
    for (let i = 0; i < effectFn.deps.length; i++) {
        const deps = effectFn.deps[i]
        deps.delete(effectFn)
    }
    effectFn.deps.length = 0
}

function computed(getter) {
    let value
    let dirty = true

    const effectFn = effect(getter, {
        lazy: true,
        scheduler() {
            if (!dirty) {
                dirty = true
                trigger(obj, 'value')
            }
        }
    })

    const obj = {
        get value() {
            if (dirty) {
                value = effectFn()
                dirty = false
            }
            track(obj, 'value')
            return value
        }
    }

    return obj
}


function watch(source, cb, options = {}) {
    let getter
    if (typeof source === 'function') {
        getter = source
    } else {
        getter = () => traverse(source)
    }

    let oldValue
    let newValue
    let cleanup
    function onInvalidate(fn) {
        cleanup = fn
    }

    const job = () => {
        newValue = effectFn()
        if (cleanup) {
            cleanup()
        }
        cb(newValue, oldValue, onInvalidate)
        oldValue = newValue
    }

    const effectFn = effect(
        () => getter(),
        {
            lazy: true,
            scheduler: () => {
                if (options.flush === 'post') {
                    const p = Promise.resolve()
                    p.then(job)
                } else {
                    job()
                }
            }
        }
    )

    if (options.immediate) {
        job()
    } else {
        oldValue = effectFn()
    }
}

function traverse(value, seen = new Set()) {
    // console.log(value)
    if (
        typeof value !== 'object' 
        || value === null 
        || seen.has(value)
    ) {
        return
    }

    seen.add(value)
    for (const k in value) {
        traverse(value[k], seen)
    }
    return value
}

function createReactive(obj, isShallow = false, isReadonly = false) {
    return new Proxy(obj, {
        has(target, key) {
            track(target, key)
            return Reflect.has(target, key)
        },
        get(target, key, receiver) {
            // 代理对象可以通过 raw 属性访问原始数据
            if (key === 'raw') {
                return target
            }

            // 如果操作的对象是数组，并且key 存在于 arrayInstrumentations 上
            //  那么返回定义在 arrayInstrumentations 上的值
            if (Array.isArray(target) && arrayInstrumentations.hasOwnProperty(key)) {
                return Reflect.get(arrayInstrumentations, key, receiver)
            }

            // 非只读的时候才需要建立响应联系
            //  如果key 的类型是symbol，则不进行追踪
            if (!isReadonly && typeof key !== 'symbol') {
                track(target, key)
            }
            

            const res = Reflect.get(target, key, receiver)

            // 当读取属性操作发生时，在 get 拦截函数内如果发现是浅响应的，
            //  那么直接返回原始数据即可
            if (isShallow) {
                return res
            }

            if (typeof res === 'object' && res !== null) {
                // 调用 reactive 将结果包装成响应式数据并返回
                //  如果数据为只读，则调用 readonly 对值进行包装
                return isReadonly ? readonly(res) : reactive(res)
            }
            return res
        },
        set(target, key, newValue, receiver) {
            if (isReadonly) {
                console.warn(`属性 ${key} 是只读的`)
                return true
            }
            const oldVal = target[key]

            // 
            const type = Array.isArray(target)
                // 如果代理目标是数组，则检测被设置的索引值是否小于数组长度
                //  如果是，则视作 SET ，否则是 ADD
                ? Number(key) < target.length ? TriggerType.SET : TriggerType.ADD
                : Object.prototype.hasOwnProperty.call(target, key) ? TriggerType.SET : TriggerType.ADD

            const res = Reflect.set(target, key, newValue, receiver)
            if (target === receiver.raw) {
                if (oldVal !== newValue 
                    && (oldVal === oldVal || newValue === newValue)
                ) {
                    trigger(target, key, type, newValue)
                }
            }

            // Proxy 的机制
            //  如果此处不返回true，则会报TypeError 的错误
            // return true
            return res
        },
        deleteProperty(target, key) {
            if (isReadonly) {
                console.warn(`属性 ${key} 是只读的`)
                return true
            }
            const hadKey = Object.prototype.hasOwnProperty.call(target, key)
            const res = Reflect.deleteProperty(target, key)
            if (res && hadKey) {
                trigger(target, key, TriggerType.DELETE)
            }
            return res
        },
        ownKeys(target) {
            // 如果操作目标target 是数组，则使用length 属性作为key 并建立响应联系
            track(target, Array.isArray(target) ? 'length' : ITERATE_KEY)
            return Reflect.ownKeys(target)
        }
    })
}

export function reactive(obj) {
    const existionProxy = reactiveMap.get(obj)
    if (existionProxy) return existionProxy

    const proxy = createReactive(obj)
    reactiveMap.set(obj, proxy)

    return proxy
}

export function shallowReactive(obj) {
    return createReactive(obj, true)
}

function readonly(obj) {
    return createReactive(obj, false, true /* 只读 */)
}

export function shallowReadonly(obj) {
    return createReactive(obj, true /* shallow */, true)
}

function createMutableReactive(obj, isShallow = false, isReadonly = false) {
    return new Proxy(obj, {
        get(target, key, receiver) {
            if (key === 'raw') {
                return target
            }
            if (key === 'size') {
                track(target, ITERATE_KEY)
                return Reflect.get(target, key, target)
            }

            return mutableInstrumentations[key]
        }

    })
}


// function createMutableReactive()



// const arr = reactive(['foo'])

// effect(() => {
//     for (const k in arr) {
//         console.log(k)
//     }
// })

// watch(
//     obj, 
//     () => {
//         console.log('变化了')
//     }
// )

// log(traverse(obj))

// obj.foo = 2

// effect(() => {
//     obj.foo = obj.foo + 1
//     log(obj.foo)
// })

// const effectFn = computed(() => obj.foo + obj.bar)

// log(effectFn.value)

// setTimeout(() => {
//     obj.noExit = 'hello vue3'
//     obj.noExit
// }, 1000)





