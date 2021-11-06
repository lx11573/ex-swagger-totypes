import type { OpenAPIV3 } from 'openapi-types'

import { BaseParser, handleType } from './'
import { randomId, getValueByPath, log } from '../tools'

interface DereferenceItem extends Required<OpenAPIV3.OperationObject> {}

type SchemaType<T> = T extends 'array'
  ? OpenAPIV3.ArraySchemaObject
  : T extends 'object'
  ? OpenAPIV3.NonArraySchemaObject
  : OpenAPIV3.SchemaObject

type SchemaItem<T extends 'array' | 'object' | void = void> = Omit<SchemaType<T>, 'required'> & {
  /** 字段名 */
  name: string
  /** 是否必填项 */
  required?: boolean
  /** 子代必填项 */
  itemsRequiredNamesList?: string[]
  /** 子代类型 */
  itemsType?: string
}

export class OpenAPIV3Parser extends BaseParser {
  parse() {
    const { paths } = this.swaggerJson
    for (const path in paths) {
      const pathItem = paths[path]
      if (!pathItem) continue
      const pathItemKeys = Object.keys(pathItem)
      const multipleMethod = pathItemKeys.length > 1
      pathItemKeys.forEach((method) => this.parseMethodItem(path, pathItem[method], method, multipleMethod))
    }

    return this.result
  }

  /** 解析接口方法 */
  parseMethodItem(path: string, item: DereferenceItem, method: string, multipleMethod: boolean) {
    const { description, summary, tags, operationId, parameters, requestBody, responses } = item
    const fileName = this.getKebabNameByPath(path)
    const pathName = this.getCamelNameByKebab(fileName)
    const desc = description || summary || pathName

    let params: TreeInterfaceParamsItem[] | TreeInterfacePropertiesItem | undefined = []

    // get 方法优先解析 parameters 参数，其它方法优先解析 body 参数。
    // TODO: 待调研：优先使用 url search 作为参数的方法除 get 外是否还有其它。
    if (['GET'].includes(method.toUpperCase())) {
      if (parameters) {
        params = this.parseParameters(parameters)
      } else if (requestBody) {
        params = this.parseRequestBody(requestBody)
      }
    } else {
      if (requestBody) {
        params = this.parseRequestBody(requestBody)
      } else if (parameters) {
        params = this.parseParameters(parameters)
      }
    }

    console.log('params---', params)

    const response = {} as any
    // const response = this.parseResponse(responses)

    const itemRes: SwaggerJsonTreeItem = {
      groupName: this.configItem.title,
      type: 'interface',
      key: randomId(`${desc}-xxxxxx`),
      basePath: this.configItem.basePath || '',
      parentKey: '',
      method,
      params,
      response,
      title: desc,
      subTitle: path,
      path,
      pathName,
      fileName,
      operationId,
    }

    this.pushGroupItem(tags, itemRes)
  }

  /** 解析 parameters 参数 */
  parseParameters(parameters: OpenAPIV3.OperationObject['parameters']): TreeInterfaceParamsItem[] {
    if (!parameters) {
      log.warn('parseParameters: parameters is null.')
      return []
    }

    const paramCatchObj: Record<string, TreeInterfaceParamsItem> = {}

    parameters.forEach((paramItem) => {
      const paramSchema = this.dereferenceSchema<OpenAPIV3.ParameterObject>(paramItem)

      if (!paramSchema) return
      if (paramSchema.in === 'header') return // 忽略 headers
      if (Object.prototype.hasOwnProperty.call(paramCatchObj, paramSchema?.name)) return // 去重，用于解决 NodeJS 的 nest/swagger 不规范定义导致的字段重复问题。

      const schema = this.dereferenceSchema(paramSchema.schema) || {}

      const propertiesItem: SchemaItem = {
        name: paramSchema.name,
        description: paramSchema.description,
        ...schema,
        required: paramSchema.required,
      }

      if (paramSchema.required) {
        propertiesItem.itemsRequiredNamesList = schema.required
      }

      if (schema.type === 'array') {
        paramCatchObj[propertiesItem.name] = this.parseArray(propertiesItem as SchemaItem<'array'>)
      } else {
        paramCatchObj[propertiesItem.name] = this.parseObject(propertiesItem as SchemaItem<'object'>)
      }
    })

    return Object.values(paramCatchObj)
  }

  /** 解析 body 参数 */
  parseRequestBody(
    requestBodyUnresolved: OpenAPIV3.OperationObject['requestBody']
  ): TreeInterfacePropertiesItem | undefined {
    const requestBody = this.dereferenceSchema<OpenAPIV3.RequestBodyObject>(requestBodyUnresolved)
    if (!requestBody) {
      log.warn('parseRequestBody: requestBody is null.')
      return void 0
    }

    // WARN: 永远只取首位键值对，通常为：application/json，其它情况忽略
    const requestBodyContent = Object.values(requestBody.content || {})?.[0]

    if (!requestBodyContent) {
      log.warn('parseRequestBody: requestBodyContent is null.')
      return void 0
    }

    const requestBodySchema = this.dereferenceSchema(requestBodyContent.schema)
    if (!requestBodySchema) {
      log.warn('parseRequestBody: requestBodySchema is null.')
      return void 0
    }

    return this.parseSchemaObject(requestBodySchema, '')
  }

  /** 解析接口返回值 */
  parseResponse(responses: OpenAPIV3.ResponsesObject): TreeInterfacePropertiesItem | string {
    const responseBody = (responses[200] || {}) as OpenAPIV3.ResponseObject

    const content = Object.values(responseBody.content || {})
    const schema = this.dereferenceSchema(content[0].schema)

    if (!schema) return 'any'

    const { properties, type, required } = schema

    if (!properties) return handleType(type)

    for (const key in properties) {
      const val = this.dereferenceSchema(properties[key])
      if (!val) continue
      const obj: TreeInterfacePropertiesItem = {
        name: key,
        type: handleType(val.type),
        required: required && required.length && required.includes(key) ? true : false,
        description: val.description,
        titRef: val.title,
      }

      // if ((val.originalRef && val.originalRef != originalRef) || (val.$ref && val.$ref != $ref)) {
      //   obj.item = getSwaggerJsonRef(val, definitions)
      // }

      // if (val.items) {
      //   let schema
      //   if (val.items.schema) {
      //     schema = val.items.schema
      //   } else if (val.items.originalRef || val.items.$ref) {
      //     schema = val.items
      //   } else if (val.items.type) {
      //     obj.itemsType = val.items.type
      //   } else if (val.originalRef || val.$ref) {
      //     schema = val
      //   }

      //   if (schema && (schema.originalRef != originalRef || schema.$ref != $ref)) {
      //     obj.item = getSwaggerJsonRef(schema, definitions)
      //   }
      // }

      // propertiesList.push(obj)
    }

    return 'number'
  }

  parseSchemaObject(schema: OpenAPIV3.SchemaObject, name: string, itemsRequiredNamesList?: string[]) {
    let requiredBoolean = false
    if (itemsRequiredNamesList) {
      requiredBoolean = itemsRequiredNamesList.includes(name)
    }

    if (schema.type === 'array') {
      const { required, ...val } = schema
      return this.parseArray({ ...val, name, required: requiredBoolean, itemsRequiredNamesList: required })
    } else {
      const { required, ...val } = schema
      return this.parseObject({ ...val, name, required: requiredBoolean, itemsRequiredNamesList: required })
    }
  }

  // /** 解析类型定义 (对象) (递归) (顶层) */
  // parseSchemaObject(schema: OpenAPIV3.SchemaObject, parentRef?: string): TreeInterfacePropertiesItem[] | string {
  //   const { properties, type, required, title } = schema

  //   // 没有子类，直接输出类型
  //   if (!properties) return handleType(type)

  //   const arr: TreeInterfacePropertiesItem[] = []
  //   for (const name in properties) {
  //     const itemSchema = this.dereferenceSchema(properties[name])
  //     if (!itemSchema) continue

  //     if (type === 'array') {
  //       arr.push(this.parseArray(itemSchema as SchemaItem<'array'>))
  //     } else if (type === 'object') {
  //       arr.push(this.parseObject(itemSchema as SchemaItem<'object'>))
  //     }
  //   }

  //   return arr
  // }

  /** 解析数组 */
  parseArray(arrayItem: SchemaItem<'array'>): TreeInterfacePropertiesItem {
    const { type, description } = arrayItem
    const items = this.dereferenceSchema(arrayItem.items) || {}

    const { type: itemsType, ...itemsData } = items

    const itemSchema: SchemaItem = {
      name: arrayItem.name,
      type,
      itemsType,
      description,
      ...itemsData,
      required: undefined,
    }

    if (arrayItem.itemsRequiredNamesList) {
      itemSchema.required = arrayItem.itemsRequiredNamesList.includes(arrayItem.name)
    }

    if (!type) {
      return itemSchema
    }

    if (itemsType === 'array') {
      return this.parseArray(itemSchema as SchemaItem<'array'>)
    } else {
      if (items.required) {
        itemSchema.itemsRequiredNamesList = items.required
      }
      return this.parseObject(itemSchema as SchemaItem<'object'>)
    }

    // return res
  }

  /** 解析对象 */
  parseObject(propertiesItem: SchemaItem<'object'>, parentRef?: string): TreeInterfacePropertiesItem {
    const res: TreeInterfacePropertiesItem = {
      ...propertiesItem,
    }

    if (res.properties) {
      res.item = this.parseProperties(propertiesItem.properties, propertiesItem.itemsRequiredNamesList)
    } else {
      // console.log({ res })
    }

    // let properties = res.properties

    // if (!properties) {
    //   const { allOf, oneOf, anyOf } = propertiesItem

    //   let itemArr = allOf || oneOf || anyOf
    //   const isUnion = !allOf && (oneOf || anyOf)
    //   if (itemArr) {
    //     itemArr = itemArr.filter((x: any) => x && x.$ref !== parentRef) // 终止递归类型嵌套
    //   }

    //   if (!itemArr || !itemArr.length) return res

    //   if (isUnion) {
    //     // TODO
    //     // const itemUnion: TreeInterfacePropertiesItem['itemUnion'] = []
    //     // itemArr.forEach((item) => {
    //     //   const itemSchema = this.dereferenceSchema(item)
    //     //   if (!itemSchema) {
    //     //     log.warn('parseObject - itemUnion: itemSchema is null.')
    //     //     return
    //     //   }
    //     //   itemUnion.push(this.parseSchemaObject(itemSchema, (item as any)?.$ref))
    //     // })
    //     // obj.itemUnion = itemUnion
    //   } else {
    //     let itemMerge: TreeInterfacePropertiesItem[] | string | undefined
    //     itemArr.forEach((item) => {
    //       const itemSchema = this.dereferenceSchema(item)
    //       if (!itemSchema) {
    //         log.warn('parseObject - itemUnion: itemSchema is null.')
    //         return
    //       }

    //       console.log('parseObject ---- ', itemSchema)
    //       const itemParsed = this.parseSchemaObject(itemSchema, (item as any)?.$ref)

    //       if (itemMerge) {
    //         itemMerge = this.mergeAllOf(itemMerge, itemParsed)
    //       } else {
    //         itemMerge = itemParsed
    //       }
    //     })
    //   }

    //   // arr.push(obj)
    // }

    return res
  }

  parseProperties(properties: OpenAPIV3.BaseSchemaObject['properties'], itemsRequiredNamesList?: string[]) {
    const arr: TreeInterfacePropertiesItem[] = []
    for (const name in properties) {
      const schemaSource = properties[name] as OpenAPIV3.ReferenceObject
      const propertiesSchema = this.dereferenceSchema(schemaSource)
      if (!propertiesSchema) {
        continue
      }

      arr.push(this.parseSchemaObject(propertiesSchema, name, itemsRequiredNamesList))
    }
    return arr
  }

  /** 去重合并 allOf 元数据数组 */
  mergeAllOf(
    a: TreeInterfacePropertiesItem['item'],
    b: TreeInterfacePropertiesItem['item']
  ): TreeInterfacePropertiesItem['item'] {
    if (!a || typeof a === 'string') {
      return b
    } else if (!b || typeof b === 'string') {
      return a
    }

    const cacheObj: Record<string, TreeInterfacePropertiesItem> = {}
    a.forEach((v) => {
      cacheObj[v.name] = v
    })

    b.forEach((v) => {
      if (cacheObj[v.name]) return // 重复则忽略后数据
      cacheObj[v.name] = v
    })

    return Object.values(cacheObj)
  }

  /** SchemaObject 解引用 */
  dereferenceSchema<T = OpenAPIV3.SchemaObject>(schema?: { $ref?: string } & Record<string, any>): T | undefined {
    if (!schema) return
    if (schema.$ref) {
      const pathStr = schema.$ref.substring(1, schema.$ref.length)
      return getValueByPath<T>(this.swaggerJson, pathStr)
    } else {
      return schema as T
    }
  }
}
