/**
 * 中划线转驼峰
 * @param {String} str
 * @param {Boolean} c 首字母是否大写
 */
export function toCamel(str: string, c?: boolean, s = '-'): string {
  const REG = new RegExp(`([^${s}])(?:${s}+([^${s}]))`, 'g')
  let strH = str.replace(REG, (_, $1, $2) => $1 + $2.toUpperCase())
  if (c) strH = strH.slice(0, 1).toUpperCase() + strH.slice(1)
  return strH
}

/**
 * 格式化日期
 * @param d
 * @param format 'YYYY-MM-DD H:I:S.MS'
 */
export function formatDate(date: Date = new Date(), format = 'YYYY-MM-DD H:I:S.MS') {
  const obj = {
    YYYY: date.getFullYear().toString().padStart(4, '0'),
    MM: (date.getMonth() + 1).toString().padStart(2, '0'),
    DD: date.getDate().toString().padStart(2, '0'),
    H: date.getHours().toString().padStart(2, '0'),
    I: date.getMinutes().toString().padStart(2, '0'),
    S: date.getSeconds().toString().padStart(2, '0'),
    MS: date.getMilliseconds().toString().padStart(3, '0'),
  }

  return format.replace(/(YYYY|MM|DD|H|I|S|MS)/g, (_, $1) => {
    return obj[$1]
  })
}

/**
 * 生成一组随机 ID
 * @param {String} 格式, x 为随机字符
 */
export function randomId(t = 'id-xxxxx'): string {
  return t.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0,
      v = c == 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * 通过路径查找值
 * @param obj
 * @param path
 * @param strict
 */
export function getValueByPath<T = any>(obj: any, path: string, strict?: boolean): T | undefined {
  let tempObj = obj
  let pathH = path.replace(/\[(\w+)\]/g, '.$1')
  pathH = pathH.replace(/^\./, '')
  const keyArr = pathH.split('.')
  let i = 0
  for (let len = keyArr.length; i < len - 1; ++i) {
    if (!tempObj && !strict) break
    const key = keyArr[i]
    if (key in tempObj) {
      tempObj = tempObj[key]
    } else {
      if (strict) {
        throw new Error('please transfer a valid prop path to form item!')
      }
      break
    }
  }
  return tempObj ? tempObj[keyArr[i]] : undefined
}

/**
 * 通过路径写入值
 * @param obj
 * @param path
 * @param strict
 */
export function setValueByPath<T = any>(obj: any, path: string, value: any): void {
  let tempObj = obj
  let pathH = path.replace(/\[(\w+)\]/g, '.$1')
  pathH = pathH.replace(/^\./, '')
  const keyArr = pathH.split('.')

  for (let i = 1; i <= keyArr.length; i++) {
    const key = keyArr[i - 1]
    if (i >= keyArr.length) {
      tempObj[key] = value
    } else {
      tempObj = tempObj[key]
    }
  }
}
