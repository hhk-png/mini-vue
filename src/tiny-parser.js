const State = {
    initial: 1, // 初始状态
    tagOpen: 2, // 标签开始状态
    tagName: 3, // 标签名称状态
    text: 4, // 文本状态
    tagEnd: 5, // 结束标签状态
    tagEndName: 6 // 结束标签名称状态
}

function isAlpha(char) {
    return char >= 'a' && char <= 'z' || char >= 'A' && char <= 'Z'
}

// 用来打印当前AST 中节点的信息
function dump(node, indent = 0) {
    const type = node.type
    // 节点的描述
    // 如果是根节点，则没有描述
    //  如果是 ELement 类型的节点，则使用 node.tag 作为节点的描述
    //  如果是 Text 类型的节点，则使用 node.content 作为节点的描述
    const desc = node.type === 'Root'
        ? ''
        : node.type === 'Element'
            ? node.tag
            : node.content
    console.log(`${'-'.repeat(indent)}${type}: ${desc}`)
    if (node.children) {
        node.children.forEach(n => dump(n, indent + 2))
    }
}

function tokenize(str) {
    let currentState = State.initial
    const chars = []
    const tokens = []
    while (str) {
        const char = str[0]
        switch(currentState) {
            case State.initial:
                if (char === '<') {
                    currentState = State.tagOpen
                    str = str.slice(1)
                } else if (isAlpha(char)) {
                    currentState = State.text
                    chars.push(char)
                    str = str.slice(1)
                }
                break
            case State.tagOpen:
                if (isAlpha(char)) {
                    currentState = State.tagName
                    chars.push(char)
                    str = str.slice(1)
                } else if (char === '/') {
                    currentState = State.tagEnd
                    str = str.slice(1)
                }
                break
            case State.tagName:
                if (isAlpha(char)) {
                    chars.push(char)
                    str = str.slice(1)
                } else if (char === '>') {
                    currentState = State.initial
                    tokens.push({
                        type: 'tag',
                        name: chars.join('')
                    })
                    chars.length = 0
                    str = str.slice(1)
                }
                break
            case State.text:
                if (isAlpha(char)) {
                    chars.push(char)
                    str = str.slice(1)
                } else if (char === '<') {
                    currentState = State.tagOpen
                    tokens.push({
                        type: 'text',
                        content: chars.join('')
                    })
                    chars.length = 0
                    str = str.slice(1)
                }
                break
            case State.tagEnd:
                if (isAlpha(char)) {
                    currentState = State.tagEndName
                    chars.push(char)
                    str = str.slice(1)
                }
                break
            case State.tagEndName:
                if (isAlpha(char)) {
                    chars.push(char)
                    str = str.slice(1)
                } else if (char === '>') {
                    currentState = State.initial
                    tokens.push({
                        type: 'tagEnd',
                        name: chars.join('')
                    })
                    chars.length = 0
                    str = str.slice(1)
                }
                break
        }
    }
    return tokens
}

function parse(str) {
    const tokens = tokenize(str)
    // 根节点
    const root = {
        type: 'Root',
        children: []
    }
    const elementStack = [root]

    while (tokens.length) {
        const parent = elementStack[elementStack.length - 1]
        const token = tokens[0]
        switch(token.type) {
            case 'tag':
                const elementNode = {
                    type: 'Element',
                    tag: token.name,
                    children: []
                }
                parent.children.push(elementNode)
                elementStack.push(elementNode)
                break
            case 'text':
                const textNode = {
                    type: 'Text',
                    content: token.content
                }
                parent.children.push(textNode)
                break
            case 'tagEnd':
                elementStack.pop()
                break
        }
        // 消费已经扫描过的 token
        tokens.shift()
    }
    return root
}

function traverseNode(ast, context) {
    context.currentNode = ast
    // 增加退出阶段的回调函数数组
    const exitFns = []
    const transforms = context.nodeTransforms

    for (let i = 0; i < transforms.length; i++) {
        const onExit = transforms[i](context.currentNode, context)
        if (onExit) {
            // 将退出阶段的回调添加到 exitFns 数组中
            exitFns.push(onExit)
        }
        // 由于任何转换函数都可能移除当前节点，因此每个转换函数执行完毕后，
        //  都应该检查当前节点是否已经被移除，如果被移除了，直接返回即可
        if (!context.currentNode) return
    }

    const children = context.currentNode.children
    if (children) {
        for (let i = 0; i < children.length; i++) {
            context.parent = context.currentNode
            context.childIndex = i
            traverseNode(children[i], context)
        }
    }

    // 在节点处理的最后阶段执行缓存到exitFns 中的回调函数，
    //  这里我们要反执行
    let i = exitFns.length
    while (i--) {
        exitFns[i]()
    }
}

function createStringLiteral(value) {
    return {
        type: 'StringLiteral',
        value
    }
}

function createIdentifer(name) {
    return {
        type: 'Identifer',
        name
    }
}

function createArrayExpression(elements) {
    return {
        type: 'ArrayExpression',
        elements
    }
}

function createCallExpression(callee, argements) {
    return {
        type: 'CallExpression',
        callee: createIdentifer(callee),
        argements
    }
}

function transformRoot(node, context) {
    return () => {
        if (node.type !== 'Root') {
            return
        }
        const vnodeJSAST = node.children[0].jsnode
        node.jsnode = {
            type: 'FunctionDecl',
            id: {type: 'Identifier', name: 'render'},
            params: [],
            body: [
                {
                    type: 'ReturnStatement',
                    return: vnodeJSAST
                }
            ]
        }
    }
}

function transformElement(node, context) {
    return () => {
        // 将转换代码编写在退出阶段的回调函数中
        //  这样可以保证该标签节点的子节点全部被处理完毕
        if (node.type !== 'Element') {
            return
        }

        const callExp = createCallExpression('h', [
            createStringLiteral(node.tag)
        ])
        // 处理 h 调用的参数
        node.children.length === 1
            ? callExp.argements.push(node.children[0].jsnode)
            : callExp.argements.push(
                createArrayExpression(node.children.map(c => c.jsnode))
            )
        // 将当前标签节点对应的 JavaScript AST 添加到 jsNode 属性下
        node.jsnode = callExp
    }
}

function transformText(node, context) {
    if (node.type !== 'Text') {
        return 
    }

    node.jsnode = createStringLiteral(node.content)
}

function transform(ast) {
    const context = {
        // 存储当前正在转换的节点
        currentNode: null,
        // 存储当前节点在父节点的 children 中的位置索引
        childIndex: 0,
        parent: null,
        // 用于替换节点的函数，接收新节点作为参数
        replaceNode(node) {
            context.parent.children[context.childIndex] = node
            context.currentNode = node
        },
        // 用于删除当前节点
        removeNode() {
            if (context.parent) {
                context.parent.children.splice(context.childIndex, 1)
                context.currentNode = null
            }
        },
        nodeTransforms: [
            transformElement,
            transformText,
            transformRoot
        ]
    }

    traverseNode(ast, context)
    console.log(dump(ast))
    console.log(context.currentNode)
}

function genNodeList(nodes, context) {
    const {push} = context
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i]
        genNode(node, context)
        if (i < nodes.length - 1) {
            push(', ')
        }
    }
}

function genFunctionDecl(node, context) {
    const {push, indent, deIndent} = context
    // node.id 是一个标识符，用来描述函数的名称
    push(`function ${node.id.name} `)
    push(`(`)
    genNodeList(node.params, context)
    push(`)`)
    push(`{`)
    indent()
    node.body.forEach(n => genNode(n, context))
    deIndent()
    push(`}`)
}

function genReturnStatement(node, context) {
    const {push} = context
    push(`return `)
    genNode(node.return, context)
}

function genStringLiteral(node, context) {
    const {push} = context
    push(`'${node.value}'`)
}

function genArrayExpression(node, context) {
    const {push} = context
    push(`[`)
    genNodeList(node.elements, context)
    push(`]`)
}

function genCallExpression(node, context) {
    const {push} = context
    const {callee, argements: args} = node
    push(`${callee.name}(`)
    genNodeList(args, context)
    push(`)`)
}

function genNode(node, context) {
    switch(node.type) {
        case 'FunctionDecl':
            genFunctionDecl(node, context)
            break
        case 'ReturnStatement':
            genReturnStatement(node, context)
            break
        case 'CallExpression':
            genCallExpression(node, context)
            break
        case 'StringLiteral':
            genStringLiteral(node, context)
            break
        case 'ArrayExpression':
            genArrayExpression(node, context)
            break
    }
}

function generate(node) {
    const context = {
        code: '',
        push(code) {
            context.code += code
        },
        currentIndent: 0,
        newline() {
            context.code += '\n' + `  `.repeat(context.currentIndent)
        },
        indent() {
            context.currentIndent++
            context.newline()
        },
        deIndent() {
            context.currentIndent--
            context.newline()
        }
    }

    genNode(node, context)
    return context.code
}

function compile(template) {
    const ast = parse(template)
    transform(ast)
    const code = generate(ast.jsnode)
    return code
}

const ast = parse(`<p>Vue<p>Vue</p></p>`)

transform(ast)

const code = generate(ast.jsnode)

console.log(code)



