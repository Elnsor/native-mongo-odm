
// simple RBAC
export const collectionRole={
    users:{
        read:["admin","manager"],
        write:[],
        update:["admin"]
    },
    product:{
        read:["admin","manager","user"],
        write:["admin","manager"],
        update:["admin","manager"]
    },
}