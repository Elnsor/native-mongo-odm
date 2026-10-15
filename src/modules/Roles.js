/** */
import { RoleBuilder } from "../rbac/builder/buildGroupRole.js";
import { rbacManager } from "../rbac/rbacManager.js";
import { dbAppIns } from "../dpApp.js";

const roleGuest=new RoleBuilder();
roleGuest.addMember('role-1')
.addLeaf("DOCUMENTS")
.setParent("COLLECTIONS",["users"])
.addOwner('1')
.setActions("RWUO")
.setOtherActions("RA")
.endLeaf()
.endMember()


const roleAdmin=new RoleBuilder();
roleAdmin.addMember('role-1')
.addLeaf("DOCUMENTS")
.setParent("COLLECTIONS",["*"])
.addOwner('*')
.setActions("RWUDA")
.setOtherActions("NONE")
.endLeaf()
.endMember()






const initRoles=()=>{
    rbacManager.createRole("GUEST",roleGuest.build());
    rbacManager.createRole("ADMIN",roleAdmin.build());
};
dbAppIns.registerHandlerAfter(initRoles);
