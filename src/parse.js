const TextModes = {
    DATA: 'DATA',
    RCDATA: 'RCDATA',
    RAWTEXT: 'RAWTEXT',
    CDATA: 'CDATA'
}

function isEnd(context, ancestors) {
    // 当模板内容解析完毕后，停止
    if (!context.source) {
        return true
    }
    const parent = ancestors[ancestors.length - 1]
    // 如果遇到结束标签，并且该标签与父级标签节点同名，则停止
    if (parent && context.source.startsWith(`</${parent.tag}`)) {
        return true
    }
}

function parseComment(context) {
    
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

function parseEndTag() {

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
    }
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



