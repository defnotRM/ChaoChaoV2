const fs = require('fs');

const xml = `<mxfile host="app.diagrams.net">
  <diagram name="ChaoChao Deployment Diagram" id="chaochao-deploy">
    <mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1169" pageHeight="827" background="#ffffff">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />

        <!-- Outer Frame: deployment ChaoChao Web Application -->
        <mxCell id="frame" value="deployment ChaoChao Web Application" style="shape=folder;fontStyle=1;tabWidth=280;tabHeight=30;tabPosition=left;html=1;boundedLbl=1;fillColor=#f8f9fa;strokeColor=#495057;align=left;spacingLeft=10;verticalAlign=top;" vertex="1" parent="1">
          <mxGeometry x="40" y="40" width="1080" height="600" as="geometry" />
        </mxCell>

        <!-- ======================================================== -->
        <!-- LEFT DEVICE: wsrv-01 (Application Server) -->
        <!-- ======================================================== -->
        <mxCell id="wsrv" value="&lt;b&gt;«device»&lt;br&gt;wsrv-01: Ubuntu Linux Application Server&lt;/b&gt;" style="verticalAlign=top;align=center;spacingTop=10;fillColor=#ffffff;strokeColor=#000000;strokeWidth=1.5;html=1;" vertex="1" parent="frame">
          <mxGeometry x="30" y="50" width="570" height="510" as="geometry" />
        </mxCell>

        <!-- Web Server Runtime: Node.js 20 -->
        <mxCell id="webserver" value="&lt;b&gt;«web server»&lt;br&gt;:Node.js 20 LTS&lt;/b&gt;" style="verticalAlign=top;align=center;spacingTop=8;fillColor=#ffffff;strokeColor=#000000;strokeWidth=1;html=1;" vertex="1" parent="wsrv">
          <mxGeometry x="25" y="60" width="520" height="425" as="geometry" />
        </mxCell>

        <!-- Execution Environment: Next.js Container -->
        <mxCell id="execenv" value="&lt;b&gt;«executionEnvironment»&lt;br&gt;:Next.js Application Container&lt;/b&gt;" style="verticalAlign=top;align=center;spacingTop=8;fillColor=#ffffff;strokeColor=#000000;strokeWidth=1;html=1;" vertex="1" parent="webserver">
          <mxGeometry x="25" y="60" width="470" height="340" as="geometry" />
        </mxCell>

        <!-- 1. Deployment Spec: .env.local -->
        <mxCell id="deploy_spec" value="«deployment spec»&lt;br&gt;&lt;b&gt;.env.local&lt;/b&gt;&lt;br&gt;&lt;font color=&quot;#555555&quot; style=&quot;font-size: 10px;&quot;&gt;(DB &amp;amp; Supabase Keys)&lt;/font&gt;" style="shape=note;whiteSpace=wrap;html=1;size=14;verticalAlign=middle;align=center;fillColor=#ffffff;strokeColor=#000000;" vertex="1" parent="execenv">
          <mxGeometry x="30" y="45" width="160" height="60" as="geometry" />
        </mxCell>

        <!-- 2. Main Artifact: chaochao_web.build -->
        <mxCell id="main_artifact" value="«artifact»&lt;br&gt;&lt;b&gt;chaochao_web.build&lt;/b&gt;&lt;br&gt;&lt;font color=&quot;#555555&quot; style=&quot;font-size: 10px;&quot;&gt;(Next.js Web Package)&lt;/font&gt;" style="shape=note;whiteSpace=wrap;html=1;size=14;verticalAlign=middle;align=center;fillColor=#ffffff;strokeColor=#000000;" vertex="1" parent="execenv">
          <mxGeometry x="30" y="145" width="160" height="65" as="geometry" />
        </mxCell>

        <!-- 3. Secondary Artifact: payment_service.ts -->
        <mxCell id="svc_artifact" value="«artifact»&lt;br&gt;&lt;b&gt;payment_service.ts&lt;/b&gt;&lt;br&gt;&lt;font color=&quot;#555555&quot; style=&quot;font-size: 10px;&quot;&gt;(Slip Verification Module)&lt;/font&gt;" style="shape=note;whiteSpace=wrap;html=1;size=14;verticalAlign=middle;align=center;fillColor=#ffffff;strokeColor=#000000;" vertex="1" parent="execenv">
          <mxGeometry x="30" y="245" width="160" height="65" as="geometry" />
        </mxCell>

        <!-- 4. Core Component: RentalManagement -->
        <mxCell id="comp_orders" value="«component»&lt;br&gt;&lt;b&gt;RentalManagement&lt;/b&gt;&lt;br&gt;&lt;font color=&quot;#555555&quot; style=&quot;font-size: 10px;&quot;&gt;(Order &amp;amp; Rental Logic)&lt;/font&gt;" style="rounded=1;whiteSpace=wrap;html=1;verticalAlign=middle;align=center;fillColor=#ffffff;strokeColor=#000000;strokeWidth=1.5;" vertex="1" parent="execenv">
          <mxGeometry x="260" y="145" width="180" height="65" as="geometry" />
        </mxCell>

        <!-- 5. Client Library Artifact: supabase_client.js -->
        <mxCell id="lib_artifact" value="«artifact»&lt;br&gt;&lt;b&gt;supabase_client.js&lt;/b&gt;&lt;br&gt;&lt;font color=&quot;#555555&quot; style=&quot;font-size: 10px;&quot;&gt;(BaaS Connection Library)&lt;/font&gt;" style="rounded=0;whiteSpace=wrap;html=1;verticalAlign=middle;align=center;fillColor=#ffffff;strokeColor=#000000;" vertex="1" parent="execenv">
          <mxGeometry x="260" y="245" width="180" height="65" as="geometry" />
        </mxCell>

        <!-- ======================================================== -->
        <!-- EDGES / ASSOCIATIONS INSIDE EXECUTION ENVIRONMENT -->
        <!-- ======================================================== -->
        
        <!-- Edge 1: Deployment Specification (dashed with arrow) -->
        <mxCell id="edge_spec" value="deployment specification" style="endArrow=classic;html=1;exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;fontSize=10;dashed=1;" edge="1" parent="execenv" source="deploy_spec" target="main_artifact">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>

        <!-- Edge 2: Manifestation (dashed open arrow) -->
        <mxCell id="edge_manifest" value="«manifest»" style="endArrow=open;dashed=1;html=1;exitX=1;exitY=0.5;exitDx=0;exitDy=0;entryX=0;entryY=0.5;entryDx=0;entryDy=0;fontSize=11;" edge="1" parent="execenv" source="main_artifact" target="comp_orders">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>

        <!-- Edge 3: Association main_artifact -> payment_service (solid arrow) -->
        <mxCell id="edge_assoc_payment" value="«use»" style="endArrow=open;html=1;exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;fontSize=10;" edge="1" parent="execenv" source="main_artifact" target="svc_artifact">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>

        <!-- Edge 4: Association comp_orders -> supabase_client (data access) -->
        <mxCell id="edge_assoc_supabase" value="«use»" style="endArrow=open;html=1;exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;fontSize=10;" edge="1" parent="execenv" source="comp_orders" target="lib_artifact">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>

        <!-- Edge 5: Association payment_service -> supabase_client (horizontal dependency) -->
        <mxCell id="edge_assoc_svc_lib" value="«use»" style="endArrow=open;html=1;exitX=1;exitY=0.5;exitDx=0;exitDy=0;entryX=0;entryY=0.5;entryDx=0;entryDy=0;fontSize=10;" edge="1" parent="execenv" source="svc_artifact" target="lib_artifact">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>

        <!-- ======================================================== -->
        <!-- RIGHT DEVICE: dbsrv-14 (Database Server) -->
        <!-- ======================================================== -->
        <mxCell id="dbsrv" value="&lt;b&gt;«device»&lt;br&gt;dbsrv-14: Supabase Database Server&lt;/b&gt;" style="verticalAlign=top;align=center;spacingTop=10;fillColor=#ffffff;strokeColor=#000000;strokeWidth=1.5;html=1;" vertex="1" parent="frame">
          <mxGeometry x="750" y="50" width="290" height="510" as="geometry" />
        </mxCell>

        <!-- Database System: PostgreSQL 15 -->
        <mxCell id="dbsystem" value="&lt;b&gt;«database system»&lt;br&gt;:PostgreSQL 15&lt;/b&gt;" style="verticalAlign=top;align=center;spacingTop=8;fillColor=#ffffff;strokeColor=#000000;strokeWidth=1;html=1;" vertex="1" parent="dbsrv">
          <mxGeometry x="25" y="60" width="240" height="425" as="geometry" />
        </mxCell>

        <!-- Schemas -->
        <mxCell id="schema_users" value="«schema»&lt;br&gt;&lt;b&gt;Users&lt;/b&gt;&lt;br&gt;&lt;font color=&quot;#555555&quot; style=&quot;font-size: 10px;&quot;&gt;(useraccount, role)&lt;/font&gt;" style="shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=12;verticalAlign=middle;align=center;fillColor=#ffffff;strokeColor=#000000;" vertex="1" parent="dbsystem">
          <mxGeometry x="35" y="55" width="170" height="65" as="geometry" />
        </mxCell>

        <mxCell id="schema_orders" value="«schema»&lt;br&gt;&lt;b&gt;RentalOrders&lt;/b&gt;&lt;br&gt;&lt;font color=&quot;#555555&quot; style=&quot;font-size: 10px;&quot;&gt;(rentalorder, timeline)&lt;/font&gt;" style="shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=12;verticalAlign=middle;align=center;fillColor=#ffffff;strokeColor=#000000;" vertex="1" parent="dbsystem">
          <mxGeometry x="35" y="145" width="170" height="65" as="geometry" />
        </mxCell>

        <mxCell id="schema_items" value="«schema»&lt;br&gt;&lt;b&gt;Items&lt;/b&gt;&lt;br&gt;&lt;font color=&quot;#555555&quot; style=&quot;font-size: 10px;&quot;&gt;(item, category)&lt;/font&gt;" style="shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=12;verticalAlign=middle;align=center;fillColor=#ffffff;strokeColor=#000000;" vertex="1" parent="dbsystem">
          <mxGeometry x="35" y="235" width="170" height="65" as="geometry" />
        </mxCell>

        <mxCell id="schema_payments" value="«schema»&lt;br&gt;&lt;b&gt;Payments&lt;/b&gt;&lt;br&gt;&lt;font color=&quot;#555555&quot; style=&quot;font-size: 10px;&quot;&gt;(payment, slips)&lt;/font&gt;" style="shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=12;verticalAlign=middle;align=center;fillColor=#ffffff;strokeColor=#000000;" vertex="1" parent="dbsystem">
          <mxGeometry x="35" y="325" width="170" height="65" as="geometry" />
        </mxCell>

        <!-- Communication Path between Servers -->
        <mxCell id="edge_protocol" value="«protocol»&lt;br&gt;&lt;b&gt;TCP/IP&lt;/b&gt;&lt;br&gt;&lt;font color=&quot;#555555&quot; style=&quot;font-size: 10px;&quot;&gt;(Port 5432)&lt;/font&gt;" style="endArrow=none;html=1;exitX=1;exitY=0.5;exitDx=0;exitDy=0;entryX=0;entryY=0.5;entryDx=0;entryDy=0;strokeWidth=1.5;fontSize=12;verticalAlign=bottom;align=center;" edge="1" parent="frame" source="wsrv" target="dbsrv">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>

      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

fs.writeFileSync('c:/Users/rm/Desktop/CS30everything/year3/1/ise/ChaoChaoV2/chaochao_deployment.drawio', xml);
console.log('Successfully wrote chaochao_deployment.drawio with all association lines');
