
// simple RBAC
export const collectionRole={
    users:{
        read:["admin","manager"],
        write:["admin"],
    },
    product:{
        read:["admin","manager","user"],
        write:["admin","manager"]
    },
}