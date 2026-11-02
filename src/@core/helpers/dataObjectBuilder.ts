type FilterFn = (val: any) => any

export default function dataObjectBuilder(body: any) {
    const dataObject: any = {}

    function addIfValueExists(key: string, filterFn?: FilterFn) {
        if (body[key] !== undefined) {
            dataObject[key] = filterFn ? filterFn(body[key]) : body[key]
        }

        return builder
    }

    function removeValue(key: string) {
        delete dataObject[key]

        return builder
    }

    function getDataObject() {
        return dataObject
    }

    const builder = {
        addIfValueExists,
        removeValue,
        getDataObject,
        dataObject
    }

    return builder
}
