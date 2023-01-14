// 原始数据
const data = {text: 'hello world'}
// 存储副作用函数的桶
const bucket = new Set()
// 用一个全局变量存储被注册的副作用函数
let activeEffect

// 对原始数据的代理
const obj = new Proxy(data, {
    // 拦截读取操作
    get(target, key) {
        // 将副作用函数effect 添加到存储副作用函数的桶中
        bucket.add(effect)
        // 返回属性值
        return target[key]
    },
    // 拦截设置操作
    set(target, key, newValue) {
        // 设置属性值
        target[key] = newValue
        // 把副作用函数从桶里取出并执行
        bucket.forEach(fn => fn())
        // 返回true 代表设置操作成功
        return true
    }
})

// effect 函数用于注册副作用函数
function effect(fn) {
    // 当调用 effect 注册副作用函数时，
    //  将副作用函数fn 赋值给activeEffect
    activeEffect = fn
    // 执行副作用函数
    fn()
}

effect(() => {
    console.log(obj.text)
})

setTimeout(() => {
    obj.text = 'hello vue3'
}, 1000)





