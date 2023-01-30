// 有 bug


const TextModes = {
    DATA: 'DATA',
    RCDATA: 'RCDATA',
    RAWTEXT: 'RAWTEXT',
    CDATA: 'CDATA'
}

const namedCharacterReferences = {
    "gt": ">",
    "gt;": ">",
    "lt": "<",
    "lt;": "<",
    "ltcc;": "⪦"
}

// 对应的替换码点
const CCR_REPLACEMENTS = {
    0x80: 0x20ac,
    0x82: 0x201a,
    0x83: 0x0192,
    0x84: 0x201e,
    0x85: 0x2026,
    0x86: 0x2020,
    0x87: 0x2021,
    0x88: 0x02c6,
    0x89: 0x2030,
    0x8a: 0x0160,
    0x8b: 0x2039,
    0x8c: 0x0152,
    0x8e: 0x017d,
    0x91: 0x2018,
    0x92: 0x2019,
    0x93: 0x201c,
    0x94: 0x201d,
    0x95: 0x2022,
    0x96: 0x2013,
    0x97: 0x2014,
    0x98: 0x02dc,
    0x99: 0x2122,
    0x9a: 0x0161,
    0x9b: 0x203a,
    0x9c: 0x0153,
    0x9e: 0x017e,
    0x9f: 0x0178
}
let index = 0
function isEnd(context, ancestors) {
    // 当模板内容解析完毕后，停止
    if (!context.source) {
        return true
    }

    // 与父级节点栈内所有节点作比较
    for (let i = ancestors.length - 1; i >= 0; --i) {
        console.log(index++)
        // 只要栈中存在与当前结束标签同名的节点，就停止状态机
        if (context.source.startsWith(`</${ancestors[i].tag}`)) {
            return true
        }
    }

    // const parent = ancestors[ancestors.length - 1]
    // // 如果遇到结束标签，并且该标签与父级标签节点同名，则停止
    // if (parent && context.source.startsWith(`</${parent.tag}`)) {
    //     return true
    // }
}

function parseComment(context) {
    const {advanceBy, advanceSpaces} = context
    advanceBy('<!--'.length)
    closeIndex = context.source.indexOf('-->')
    const content = context.source.slice(0, closeIndex)
    advanceBy(content.length)
    advanceBy('-->'.length)
    return {
        type: 'Comment',
        content
    }
}

function parseCDATA(context, ancestors) {
    
}

function parseAttributes(context) {
    const {advanceBy, advanceSpaces} = context
    const props = []
    while (
        !context.source.startsWith('>') && 
        !context.source.startsWith('/>')
    ) {
        // 解析属性或命令
        const match = /^[^\t\r\n\f />][^\t\r\n\f />=]*/.exec(context.source)
        // 属性名
        const name = match[0]
        advanceBy(name.length)
        advanceSpaces()
        // 等于号
        advanceBy(1)
        advanceSpaces()

        // 属性值
        let value = ''
        // 获取当前模板内容的第一个内容
        const quote = context.source[0]
        // 是否被引号包裹
        const isQuote = quote === '"' || quote === "'"
        if (isQuote) {
            advanceBy(1)
            // 获取下一个引号的索引
            const endQuoteIndex = context.source.indexOf(quote)
            if (endQuoteIndex > -1) {
                value = context.source.slice(0, endQuoteIndex)
                // 属性值
                advanceBy(value.length)
                // 引号
                advanceBy(1)
            } else {
                console.error('缺少引号')
            }
        } else {
            // 代码运行到这里，说明属性值没有被引号引用
            //  下一个空白字符之前的内容全部作为属性值
            const match = /^[^\t\r\n\f >]+/.exec(context.source)
            value = match[0]
            advanceBy(value.length)
        }
        advanceSpaces()

        props.push({
            type: 'Attribute',
            name,
            value
        })
    }
    return props
}

function parseTag(context, type = 'start') {
    const {advanceBy, advanceSpaces} = context
    const match = type === 'start'
        // 匹配开始标签
        ? /^<([a-z][^\t\r\n\f />]*)/i.exec(context.source)
        // 匹配结束标签
        : /^<\/([a-z][^\t\r\n\f />]*)/i.exec(context.source)
    // 正则表达式的第一个捕获组就是标签名称
    const tag = match[1]
    // 消费正则表达式匹配的全部内容，例如'<div'
    advanceBy(match[0].length)
    advanceSpaces()
    // props 数组是由指令节点与属性节点共同组成的数组
    const props = parseAttributes(context)

    // 自闭和标签
    const isSelfClosing = context.source.startsWith('/>')
    advanceBy(isSelfClosing ? 2 : 1)

    return {
        type: 'Element',
        tag,
        // 标签的属性
        props,
        children: [],
        isSelfClosing
    }
}

function parseElement(context, ancestors) {
    const element = parseTag(context)
    if (element.isSelfClosing) {
        return element
    }

    // 切换到正确的文本模式
    if (element.tag === 'textarea' || element.tag === 'title') {
        // RCDATA 模式
        context.mode = TextModes.RCDATA
    } else if (/style|xmp|iframe|noembed|noframes|noscript/.test(element.tag)) {
        // RAWTEXT 模式
        context.mode = TextModes.RAWTEXT
    } else {
        // 否则 DATA 模式
        context.mode = TextModes.DATA
    }

    ancestors.push(element)
    element.children = parseChildren(context, ancestors)
    ancestors.pop()

    if (context.source.startsWith(`</${element.tag}`)) {
        // 再次调用 parseTag 函数解析结束标签，传递了第二个参数：'end'
        parseTag(context, 'end')
    } else {
        console.error(`${element.tag} 标签缺少闭合标签`)
    }

    return element
}

function parseInterpolation(context) {
    context.advanceBy('{{'.length)
    closeIndex = context.source.indexOf('}}')
    if (closeIndex < 0) {
        console.error('插值缺少结束定界符')
    }
    const content = context.source.slice(0, closeIndex)
    context.advanceBy(content.length)
    context.advanceBy('}}'.length)
    return {
        type: 'Interpolation',
        content: {
            type: 'Expression',
            // 表达式节点的内容则是经过 HTML 解码后的插值表达式
            content: decodeHtml(content)
        }
    }
}

function decodeHtml(rawText, asAttr = false) {
    let offset = 0
    const end = rawText.length
    let decodedText = ''
    // 引用表实体名称的最大长度
    let maxCRNameLength = 0
    
    function advance(length) {
        offset += length
        rawText = rawText.slice(length)
    }

    while (offset < end) {
        // 用于匹配字符引用的开始部分，
        //  如果匹配成功，那么 head[0] 的值将有三种可能：
        // 1. head[0] === '&'，这说明该字符引用是 命名字符引用
        // 2. head[0] === '&#'，这说明该字符引用是用 十进制表示的数字字符引用
        // 3. head[0] === '&#x'，这说明该字符引用是用 十六进制表示的数字字符引用
        const head = /&(?:#x?)?/i.exec(rawText)
        // // 如果没有匹配，说明已经没有需要解码的内容了
        if (!head) {
            const remaining = end - offset
            decodedText += rawText.slice(0, remaining)
            advance(remaining)
            break
        }

        // head.index 为匹配的字符 & 在 rawText 中的位置索引
        //  截取字符 & 之前的内容加到 decodedText 上
        decodedText += rawText.slice(0, head.index)
        // 消费字符 & 之前的内容
        advance(head.index)

        // 如果满足条件，则说明是命名字符引用，否则为数字字符引用
        if (head[0] === '&') {
            let name = ''
            let value
            if (/[0-9a-z]/i.test(rawText[1])) {
                if (!maxCRNameLength) {
                    maxCRNameLength = Object.keys(namedCharacterReferences).reduce(
                        (max, name) => Math.max(max, name.length),
                        0
                    )
                }
                // 从最大长度开始对文本进行截取，并试图去引用表中找到对应的项
                for (let length = maxCRNameLength; !value && length > 0; --length) {
                    // 截取字符 & 到最大长度之间的字符作为实体名称
                    name = rawText.substr(1, length)
                    // 使用实体名称去索引表中查找对应项的值
                    value = (namedCharacterReferences)[name]
                }
                // 如果找到了对应项的值，说明解码成功
                if (value) {
                    const semi = name.endsWith(';')
                    // 如果解码的文本作为属性值，最后一个匹配的字符不是分号，
                    //  并且最后一个匹配字符的下一个字符是等于号（=）、ASCII 字母或数字，
                    //  由于历史原因，将字符 & 和实体名称 name 作为普通文本
                    if (
                        asAttr &&
                        !semi &&
                        /[=a-z0-9]/i.test(rawText[name.length + 1] || '')
                    ) {
                        decodedText += '&' + name
                        advance(1 + name.length)
                    } else {
                        // 其他情况下，正常使用解码后的内容拼接到 decodedText 上
                        decodedText += value
                        advance(1 + name.length)
                    }
                } else {
                    // 如果没有找到对应的值，说明解码失败
                    decodedText += '&' + name
                    advance(1 + name.length)
                }
            } else {
                // 如果字符 & 的下一个字符不是 ASCII 字母或数字，
                //  则将字符 & 作为普通文本
                decodedText += '&'
                advance(1)
            }
        } else {
            // 判断是十进制表示还是十六进制表示
            const hex = head[0] === '&#x'
            const pattern = hex ? /^&#x([0-9a-f]+);?/i : /^&#([0-9]+);?/
            // 最终，body[1] 的值就是 Unicode 码点
            const body = pattern.exec(rawText)
            if (body) {
                // 根据对应的进制，将码点字符串转换为数字
                const cp = Number.parseInt(body[1], hex ? 16 : 10)
                // 码点的合法性检查
                if (cp === 0) {
                    cp = 0xfffd
                } else if (cp > 0x10ffff) {
                    // 如果码点值超过 Unicode 的最大值，替换为 0xfffd
                    cp = 0xfffd
                } else if (cp >= 0xd800 && cp <= 0xdfff) {
                    // 如果码点值处于 surrogate pair 范围内，替换为 0xfffd
                    cp = 0xfffd
                } else if ((cp >= 0xfdd0 && cp <= 0xfdef) || (cp & 0xfffe) === 0xfffe) {
                    // 如果码点值处于 noncharacter 范围内，则什么都不做，交给平台处理
                } else if (
                    // 控制字符集的范围是：[0x01, 0x1f] 加上 [0x7f, 0x9f]
                    //  去掉 ASICC 空白符：0x09(TAB)、0x0A(LF)、0x0C(FF)
                    //  0x0D(CR) 虽然也是 ASICC 空白符，但需要包含
                    (cp >= 0x01 && cp <= 0x08) ||
                    cp === 0x0b ||
                    (cp >= 0x0d && cp <= 0x1f) ||
                    (cp >= 0x7f && cp <= 0x9f)
                ) {
                    cp = CCR_REPLACEMENTS[cp] || cp
                }
                decodedText += String.fromCodePoint(cp)
                advance(body[0].length)
            } else {
                decodedText += head[0]
                advance(head[0].length)
            }
        }
        
    }
    return decodedText
}

function parseText(context) {
    // 默认将整个模板剩余内容都作为文本内容
    let endIndex = context.source.length
    // <
    const ltIndex = context.source.indexOf('<')
    // {{
    const delimiterIndex = context.source.indexOf('{{')
    // 取 < 的位置作为新的结尾索引
    if (ltIndex > -1 && ltIndex < endIndex) {
        endIndex = ltIndex
    }
    // {{ 的位置
    if (delimiterIndex > -1 && delimiterIndex < endIndex) {
        endIndex = delimiterIndex
    }
    // 此时 endIndex 是最终的文本内容的结尾索引，
    //  调用 slice 函数截取文本内容
    const content = context.source.slice(0, endIndex)
    context.advanceBy(content.length)

    return {
        type: 'Text',
        // 调用 decodeHtml 函数解码内容
        content: decodeHtml(content)
    }
}

// console.log(parseText(`foo {{bar}} baz`))

function parseChildren(context, ancestors) {
    let nodes = []
    const {mode, source} = context
    while (!isEnd(context, ancestors)) {
        let node
        // 只有 DATA 模式和 RCDATA 模式才支持插值节点的解析
        if (mode === TextModes.DATA || mode === TextModes.RCDATA) {
            // 只有 DATA 模式才支持标签节点的解析
            if (mode === TextModes.DATA && source[0] === '<') {
                if (source[1] === '!') {
                    if (source.startsWith('<!--')) {
                        // 注释
                        node = parseComment(context)
                    } else if (source.startsWith('<![CDATA[')) {
                        node = parseCDATA(context, ancestors)
                    }
                } else if (source[1] === '/') {
                    // 状态机遭遇了闭合标签，此时应该抛出错误，因为它缺少与之对应的开始标签
                    console.error('无效的结束标签')
                    continue
                } else if (/[a-z]/i.test(source[1])) {
                    // 标签
                    node = parseElement(context, ancestors)
                }
            } else if (source.startsWith('{{')) {
                // 解析插值
                node = parseInterpolation(context)
            }
        }
        // node 不存在，说明处于其他模式，即非 DATA 模式且非 RCDATA 模式
        if (!node) {
            node = parseText(context)
        }
        nodes.push(node)
    }
    return nodes
}

function parse(str) {
    const context = {
        source: str,
        // 解析器当前处于文本模式，初始模式为 DATA
        mode: TextModes.DATA,
        advanceBy(num) {
            context.source = context.source.slice(num)
        },
        advanceSpaces() {
            // 匹配空格字符
            const match = /^[\t\r\n\f ]+/.exec(context.source)
            if (match) {
                context.advanceBy(match[0].length)
            }
        }
    }

    // 第一个参数是上下文对象 context
    //  第二个参数是由父代节点构成的节点栈，初始时栈为空
    const nodes = parseChildren(context, [])

    // 解析器返回Root 根节点
    return {
        type: 'Root',
        // 使用 nodes 作为根节点的 children
        children: nodes
    }
}

console.log(parse(`<div>foo {{bar}} baz</div>`))


