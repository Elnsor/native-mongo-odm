import { RBACManager } from "./rbacManager.js";
import { RoleBuilder } from "./builder/buildGroupRole.js";
import { getMetricsSnapshot ,getSyncMetricsSnapshot ,getEventsHandler} from "../Monitoring/monitoringSystem.js";
import {setupRbacMetrics} from "../Monitoring/handler/rbacMetrics.js"


const guest=new RoleBuilder()
guest.addMember("role-1")
.addLeaf("DOCUMENTS")
.setParent("COLLECTIONS",["users"])
.setOwnerInstances([1])
.setActions(["READ"])
.setBoundary("OWN")
.addMember("role-2")
.addLeaf("DOCUMENTS")
.setParent("COLLECTIONS",["Products"])
.setOwnerInstances([1])
.setActions(["WRITE"])
.setBoundary("OWN")


console.log(guest.build());

const rbacSystem=new RBACManager();

rbacSystem.registerResource("COLLECTIONS",["users","Products"]);

rbacSystem.initialize({monitoring:{enabled:true}});
setupRbacMetrics();

console.log(rbacSystem.createRole("ADMIN",guest.build()));

const parentId=rbacSystem.getregisterResource("COLLECTIONS","users")
for(let i=0;i<5;i++)
{const acces=rbacSystem.checkAccess(1,100,parentId,101,0);

console.log(acces)}
const metrics=await getSyncMetricsSnapshot();
console.log("counter metricss --",metrics.metrics.counters)
console.log("histogram metricss --",metrics.metrics.histograms);


