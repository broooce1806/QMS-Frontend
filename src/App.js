import React, { useState, useEffect, useRef } from "react";
import CytoscapeComponent from "react-cytoscapejs";
import axios from "axios";
import ReactFlow, {
  Background,
  Controls,
  Panel,
  useNodesState,
  useEdgesState,
  addEdge,
  MarkerType,
  Handle,
  Position
} from 'reactflow';
import 'reactflow/dist/style.css';
import "./App.css";

// API Base URL
const API_BASE = process.env.REACT_APP_API_BASE || "http://127.0.0.1:8000/requirements";

// Custom Blueprint Nodes
const RequirementNode = ({ data }) => (
  <div className="custom-node requirement-node">
    <Handle type="target" position={Position.Top} />
    <div className="node-header">REQ</div>
    <div className="node-content">
      <strong>{data.id}</strong>
      <p>{data.title}</p>
    </div>
    <Handle type="source" position={Position.Bottom} />
  </div>
);

const BlockNode = ({ data }) => (
  <div className="custom-node block-node">
    <Handle type="target" position={Position.Top} />
    <div className="node-header">BLOCK</div>
    <div className="node-content">
      <strong>{data.id}</strong>
      <p>{data.name}</p>
    </div>
    <Handle type="source" position={Position.Bottom} />
  </div>
);

const TestCaseNode = ({ data }) => (
  <div className="custom-node testcase-node">
    <Handle type="target" position={Position.Top} />
    <div className="node-header">TEST CASE</div>
    <div className="node-content">
      <strong>{data.id}</strong>
      <p>{data.title}</p>
    </div>
    <Handle type="source" position={Position.Bottom} />
  </div>
);

const TestRunNode = ({ data }) => (
  <div className="custom-node testrun-node">
    <Handle type="target" position={Position.Top} />
    <div className="node-header">TEST RUN</div>
    <div className="node-content">
      <strong>{data.id}</strong>
      <p>{data.result || 'Pending'}</p>
    </div>
    <Handle type="source" position={Position.Bottom} />
  </div>
);

const DefectNode = ({ data }) => (
  <div className="custom-node defect-node">
    <Handle type="target" position={Position.Top} />
    <div className="node-header">DEFECT</div>
    <div className="node-content">
      <strong>{data.id}</strong>
      <p>{data.title}</p>
    </div>
    <Handle type="source" position={Position.Bottom} />
  </div>
);

const nodeTypes = {
  requirement: RequirementNode,
  block: BlockNode,
  testcase: TestCaseNode,
  testrun: TestRunNode,
  defect: DefectNode,
};

function App() {
  const [elements, setElements] = useState([]);
  const [reqId, setReqId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [activeTab, setActiveTab] = useState("requirement"); // requirement, testcase, run
  const [msg, setMsg] = useState("");
  const [expandedNodes, setExpandedNodes] = useState(new Set());

  // Form Initial States
  const initialReqForm = { id: "", title: "", description: "", type: "Functional", status: "Proposed", version: "1.0", component: "", custom_data: {} };
  const initialTcForm = { id: "", title: "", steps: "", expected_result: "", requirement_id: "", custom_data: {} };
  const initialRunForm = { id: "", date: new Date().toISOString().split('T')[0], result: "Pass", testcase_id: "", executed_by: "User", test_text: "" };
  const initialBlockForm = { id: "", name: "", description: "", block_type: "Component", parent_id: "" };

  // Form States
  const [reqForm, setReqForm] = useState(initialReqForm);
  const [tcForm, setTcForm] = useState(initialTcForm);
  const [runForm, setRunForm] = useState(initialRunForm);
  const [blockForm, setBlockForm] = useState(initialBlockForm);
  const [upTraceIds, setUpTraceIds] = useState([{ id: "", stereotype: "trace" }]); // Now includes SysML stereotype
  const [importing, setImporting] = useState(false);
  const [importType, setImportType] = useState("auto"); // auto, requirement, testcase, testrun, traceability
  const [viewMode, setViewMode] = useState("graph"); // graph, list
  const [dashboardReqs, setDashboardReqs] = useState([]);
  const [dashboardTcs, setDashboardTcs] = useState([]);
  const [dashboardRuns, setDashboardRuns] = useState([]);
  const [dashboardBlocks, setDashboardBlocks] = useState([]);
  const [listSearch, setListSearch] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);

  // Link Modal State (for drag-and-drop linking)
  const [linkModal, setLinkModal] = useState(null); // { sourceId, targetId }
  const [linkStereotype, setLinkStereotype] = useState("trace");
  const SYSML_STEREOTYPES = ["satisfy", "derive", "verify", "allocate", "refine", "trace", "compose"];

  // Multi-Project State
  const [view, setView] = useState("home"); // home, alm, all-reqs, create-project
  const [projects, setProjects] = useState([]);
  const [allReqs, setAllReqs] = useState([]);
  const [currentProject, setCurrentProject] = useState(null);
  const [projForm, setProjForm] = useState({ id: "", name: "", description: "", components: [""], types: ["Hardware", "Software", "System"], custom_fields: [] });
  const [wizardStep, setWizardStep] = useState(1);
  const [importStatus, setImportStatus] = useState("idle"); // idle, inspecting, mapping, processing
  const [inspectData, setInspectData] = useState(null); // { sheets: { name: [cols] } }
  const [selectedSheet, setSelectedSheet] = useState("");
  const [fieldMapping, setFieldMapping] = useState({
    id: "", title: "", description: "", type: "", status: "",
    steps: "", expected_result: "", requirement_id: "",
    date: "", result: "", executed_by: ""
  });
  const [importFile, setImportFile] = useState(null);

  // Blueprint State
  const [bpNodes, setBpNodes, onBpNodesChange] = useNodesState([]);
  const [bpEdges, setBpEdges, onBpEdgesChange] = useEdgesState([]);
  const [isLinking, setIsLinking] = useState(false);
  const [selectedBpNode, setSelectedBpNode] = useState(null);
  const [bpEditForm, setBpEditForm] = useState({});

  const cyRef = useRef(null);

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImportFile(file);
    setImportStatus("inspecting");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await axios.post(`${API_BASE}/import/inspect`, formData);
      setInspectData(res.data.sheets);
      const firstSheet = Object.keys(res.data.sheets)[0];
      setSelectedSheet(firstSheet);
      setImportStatus("mapping");
    } catch (err) {
      console.error("Inspection failed", err);
      alert("Failed to read Excel file structure. Ensure it is a valid .xlsx file.");
      setImportStatus("idle");
    }
  };

  const handleMappedImport = async () => {
    if (!importFile || !selectedSheet || !currentProject) return;
    setImportStatus("processing");

    const formData = new FormData();
    formData.append("file", importFile);

    try {
      const mappingStr = JSON.stringify(fieldMapping);
      const url = `${API_BASE}/import/mapped?sheet_name=${encodeURIComponent(selectedSheet)}&mapping=${encodeURIComponent(mappingStr)}&project_id=${currentProject.id}&table_type=${importType === "auto" ? "requirement" : importType}`;

      const res = await axios.post(url, formData);
      setMsg(res.data.message);
      setImportStatus("idle");
      setInspectData(null);
      fetchDashboard(); fetchAllReqs();
    } catch (err) {
      console.error("Mapped import failed", err);
      alert("Import failed: " + (err.response?.data?.detail || err.message));
      setImportStatus("mapping");
    }
  };

  const handleImport = async (e) => {
    // Legacy simple import - replaced by wizard
    handleFileSelect(e);
  };

  const clearForms = () => {
    setReqForm(initialReqForm); setTcForm(initialTcForm); setRunForm(initialRunForm); setBlockForm(initialBlockForm);
    setUpTraceIds([{ id: "", stereotype: "trace" }]); setMsg("");
  };

  const fetchProjects = async () => {
    try {
      const res = await axios.get(`${API_BASE}/projects`);
      setProjects(res.data);
    } catch (err) { console.error("Fetch projects failed", err); }
  };

  const fetchAllReqs = async () => {
    try {
      const res = await axios.get(`${API_BASE}/dashboard/list`);
      setAllReqs(res.data);
    } catch (err) { console.error("Fetch all reqs failed", err); }
  };

  useEffect(() => { fetchProjects(); fetchAllReqs(); }, []);

  const fetchDashboard = async () => {
    try {
      if (!currentProject) return;
      setLoading(true);
      const projectParam = `?project_id=${currentProject.id}`;
      const [reqs, tcs, runs, blocks] = await Promise.all([
        axios.get(`${API_BASE}/dashboard/list${projectParam}`),
        axios.get(`${API_BASE}/testcases/dashboard/list${projectParam}`),
        axios.get(`${API_BASE}/testruns/dashboard/list${projectParam}`),
        axios.get(`${API_BASE}/blocks${projectParam}`)
      ]);
      setDashboardReqs(reqs.data);
      setDashboardTcs(tcs.data);
      setDashboardRuns(runs.data);
      setDashboardBlocks(blocks.data);
    } catch (err) { console.error("Dashboard fetch failed", err); }
    finally { setLoading(false); }
  };

  const handleEditStart = (item, type) => {
    setEditingId(item.id);
    setEditForm({ ...item, _type: type });
  };

  const handleSaveEdit = async () => {
    if (!editForm) return;
    try {
      let endpoint = "/";
      if (editForm._type === "testcase") endpoint = "/testcases";
      if (editForm._type === "testrun") endpoint = "/testruns";

      const payload = { ...editForm };
      delete payload._type; // Remove internal helper

      // If editing a requirement through fulfillment, we need to map it back if necessary
      // But for simple fields (title, date, result), the POST merge handles it.
      await axios.post(`${API_BASE}/requirements${endpoint}`, payload);
      setEditingId(null);
      setEditForm(null);
      fetchDashboard();
    } catch (err) {
      alert("Save failed: " + (err.response?.data?.detail || err.message));
    }
  };

  const fetchGraph = async (id = reqId) => {
    if (!id.trim()) return;
    setLoading(true); setError(null); setViewMode("graph");
    if (id !== reqId) setReqId(id);
    try {
      console.log(`DEBUG: Fetching graph for ID: ${id}`);
      const response = await axios.get(`${API_BASE}/full-graph/${id}`);
      const { nodes, edges } = response.data;

      console.log(`DEBUG: Received ${nodes?.length} nodes and ${edges?.length} edges`);

      if (!nodes || nodes.length === 0) {
        setError(`No traceback found for "${id}". Ensure this ID is valid and exists in Neo4j.`);
        setElements([]);
      } else {
        const cyElements = [
          ...nodes.map((n) => ({ data: { id: n.id, label: n.label, type: n.type, reqType: n.metadata?.type, metadata: n.metadata } })),
          ...edges.map((e, i) => ({ data: { id: "e" + i, source: e.source, target: e.target, label: e.type } })),
        ];
        setElements(cyElements);
        setExpandedNodes(new Set()); // Reset exploration on new fetch
      }
    } catch (err) {
      console.error("DEBUG: Graph fetch FAIL", err);
      setError("Failed to connect to backend for graph data.");
    }
    finally { setLoading(false); }
  };

  // Derived visible elements for exploration mode
  const visibleElements = React.useMemo(() => {
    if (elements.length === 0) return [];
    // Selected Requirement is always visible
    const visibleIds = new Set([reqId]);

    // Nodes that are explicitly expanded or their neighbors are visible
    expandedNodes.forEach(id => {
      visibleIds.add(id);
      elements.forEach(e => {
        if (e.data.source === id) visibleIds.add(e.data.target);
        if (e.data.target === id) visibleIds.add(e.data.source);
      });
    });

    return elements.filter(el => {
      if (el.data.source && el.data.target) {
        return visibleIds.has(el.data.source) && visibleIds.has(el.data.target);
      }
      return visibleIds.has(el.data.id);
    });
  }, [elements, expandedNodes, reqId]);

  // Synchronized Layout Update
  useEffect(() => {
    if (cyRef.current && visibleElements.length > 0) {
      console.log("DEBUG: Cytoscape visible elements updated, running layout...");
      const cy = cyRef.current;
      // Tiered Root Detection Logic
      // 1. Find nodes that point TO the selected requirement (Parents)
      const incomingEdges = cy.edges(`target[id="${reqId}"]`);
      const parentRequirements = incomingEdges.sources().filter('node[type="Requirement"]');

      // 2. Determine the true logical "Tops" for hierarchical flow
      let roots = parentRequirements;
      if (roots.length === 0) {
        roots = cy.nodes(`[id="${reqId}"]`); // Fallback to selected req if no parents
      }

      // Apply hierarchical layout rooted at the logical tops
      cy.layout({
        name: 'breadthfirst',
        directed: true,
        padding: 100,
        roots: roots,
        animate: true,
        fit: true,
        spacingFactor: 2.0,
        avoidOverlap: true,
        nodeDimensionsIncludeLabels: true
      }).run();

      // Ensure nodes never become tinyDots by enforcing a minZoom
      cy.minZoom(0.4);
      cy.maxZoom(2.0);

      // Clear previous highlights and highlight root node if it exists
      cy.elements().removeClass('highlighted');
      if (reqId) {
        cy.nodes(`[id="${reqId}"]`).addClass('highlighted');
      }
    }
  }, [visibleElements, reqId]);

  const handleCreateRequirement = async (e) => {
    e.preventDefault();
    if (!currentProject) return;
    try {
      const payload = {
        id: reqForm.id,
        title: reqForm.title,
        description: reqForm.description || "",
        type: reqForm.type,
        status: reqForm.status || "Proposed",
        version: reqForm.version || "1.0",
        component: reqForm.component || null,
        custom_data: reqForm.custom_data || {},
        project_id: currentProject.id
      };
      console.log("Creating requirement with payload:", payload);
      await axios.post(`${API_BASE}/`, payload);
      for (const trace of upTraceIds) {
        if (trace.id.trim()) {
          await axios.post(`${API_BASE}/link`, { source_id: reqForm.id, target_id: trace.id, link_type: trace.stereotype || "trace" });
        }
      }
      setMsg(`Requirement ${reqForm.id} created!`);
      fetchDashboard(); fetchAllReqs();
      setTimeout(() => { clearForms(); }, 3000);
    } catch (err) {
      console.error("Requirement Creation failed", err);
      alert("Requirement Creation failed: " + (err.response?.data?.detail || err.message));
    }
  };

  const handleCreateTestCase = async (e) => {
    e.preventDefault();
    if (!currentProject) return;
    try {
      // Logic consolidated: /testcases endpoint now handles linking if requirement_id is present
      await axios.post(`${API_BASE}/testcases`, { ...tcForm, project_id: currentProject.id, status: "Draft" });
      setMsg(`Test Case ${tcForm.id} created!`);
      fetchDashboard(); fetchAllReqs();
      setTimeout(() => { setTcForm(initialTcForm); setMsg(""); }, 3000);
    } catch (err) { alert("Error: " + err.message); }
  };

  const handleCreateRun = async (e) => {
    e.preventDefault();
    if (!currentProject) return;
    try {
      // Logic consolidated: /testruns endpoint now handles linking if testcase_id is present
      await axios.post(`${API_BASE}/testruns`, { ...runForm, project_id: currentProject.id });
      setMsg("Execution recorded.");
      fetchDashboard(); fetchAllReqs();
      setTimeout(() => { setRunForm(initialRunForm); setMsg(""); }, 3000);
    } catch (err) { alert("Error: " + err.message); }
  };

  const handleUpTraceChange = (idx, field, val) => {
    const newTraces = [...upTraceIds]; newTraces[idx] = { ...newTraces[idx], [field]: val }; setUpTraceIds(newTraces);
  };

  // --- Block Creation Handler ---
  const handleCreateBlock = async (e) => {
    e.preventDefault();
    if (!currentProject) return;
    try {
      await axios.post(`${API_BASE}/blocks`, { ...blockForm, project_id: currentProject.id });
      setMsg(`Block ${blockForm.id} created!`);
      fetchDashboard();
      setTimeout(() => { setBlockForm(initialBlockForm); setMsg(""); }, 3000);
    } catch (err) { alert("Error: " + (err.response?.data?.detail || err.message)); }
  };

  // --- Drag-and-Drop Link Handler ---
  const handleCreateLink = async () => {
    if (!linkModal) return;
    const { sourceId, targetId, linkInfo } = linkModal;
    const endpoint = linkInfo?.endpoint || 'link';
    const srcType = getNodeType(sourceId);
    const tgtType = getNodeType(targetId);
    try {
      if (endpoint === 'link') {
        // SysML link (req-req, req-tc, etc.)
        await axios.post(`${API_BASE}/link`, { source_id: sourceId, target_id: targetId, link_type: linkStereotype });
      } else if (endpoint === 'run-link') {
        // TC ↔ Run: update testrun with testcase_id
        const runId = srcType === 'testrun' ? sourceId : targetId;
        const tcId = srcType === 'testcase' ? sourceId : targetId;
        await axios.post(`${API_BASE}/testruns`, { id: runId, project_id: currentProject?.id || '', date: new Date().toISOString().split('T')[0], result: 'Pass', executed_by: 'User', testcase_id: tcId });
      } else if (endpoint === 'defect-link') {
        // Run ↔ Defect
        const runId = srcType === 'testrun' ? sourceId : targetId;
        const defId = srcType === 'defect' ? sourceId : targetId;
        await axios.post(`${API_BASE}/link-defect`, { testrun_id: runId, defect_id: defId });
      }
      setMsg(`✅ Link created: ${sourceId} —[«${linkStereotype}»]→ ${targetId}`);
      setBpEdges((eds) => eds.concat({
        id: `${sourceId}-${targetId}-${linkStereotype}`,
        source: sourceId, target: targetId,
        label: `«${linkStereotype}»`,
        markerEnd: { type: MarkerType.ArrowClosed, color: '#5a7ab5' },
        style: { stroke: '#5a7ab5', strokeWidth: 2 },
        labelStyle: { fill: '#94a3b8', fontWeight: 700, fontSize: '10px' },
        labelBgStyle: { fill: '#0a0e1a', fillOpacity: 0.85 },
        labelBgPadding: [4, 2],
      }));
      setLinkModal(null);
      setLinkStereotype('trace');
      if (reqId) fetchGraph(reqId);
      fetchDashboard();
      setTimeout(() => setMsg(''), 3000);
    } catch (err) { alert('Link creation failed: ' + (err.response?.data?.detail || err.message)); }
  };

  const navigateToProject = (pkgOrReq) => {
    const proj = projects.find(p => p.id === pkgOrReq.project_id);
    if (proj) {
      setCurrentProject(proj);
      setView("alm");
      if (pkgOrReq.id) {
        fetchGraph(pkgOrReq.id);
      }
    }
  };

  const handleCreateProject = async () => {
    try {
      const config = {
        components: projForm.components.filter(c => c.trim()),
        types: projForm.types.filter(t => t.trim()),
        custom_fields: projForm.custom_fields
      };
      const payload = {
        id: projForm.id,
        name: projForm.name,
        description: projForm.description,
        config: config
      };
      console.log("Creating project with payload:", payload);
      await axios.post(`${API_BASE}/projects`, payload);
      setMsg("Project Created!");
      fetchProjects(); setView("home");
      setProjForm({ id: "", name: "", description: "", components: [""], types: ["Hardware", "Software", "System"], custom_fields: [] });
      setWizardStep(1);
    } catch (err) {
      console.error("Project Creation failed", err);
      alert("Project Creation failed: " + (err.response?.data?.detail || err.message));
    }
  };

  useEffect(() => {
    if (cyRef.current) {
      cyRef.current.off("tap", "node");
      cyRef.current.on("tap", "node", (evt) => {
        const data = evt.target.data();
        setSelectedNode(data);
        if (data.type === "Requirement") setTcForm(p => ({ ...p, requirement_id: data.id }));
        else if (data.type === "TestCase") setRunForm(p => ({ ...p, testcase_id: data.id }));
      });
    }
  }, [elements]);

  // Sidebar Helper Style
  // --- Blueprint Logic ---
  const getNodeType = (nodeId) => {
    const node = bpNodes.find(n => n.id === nodeId);
    return node?.type || 'unknown';
  };

  const getSmartLinkInfo = (sourceType, targetType) => {
    // Sort to handle both directions
    const pair = [sourceType, targetType].sort().join('-');
    // Req ↔ Req
    if (sourceType === 'requirement' && targetType === 'requirement')
      return { stereotype: 'trace', label: 'Trace (Req → Req)', endpoint: 'link' };
    // Req ↔ TC
    if (pair === 'requirement-testcase')
      return { stereotype: 'verify', label: sourceType === 'requirement' ? 'Verified By (Req → TC)' : 'Verifies (TC → Req)', endpoint: 'link' };
    // TC ↔ TR
    if (pair === 'testcase-testrun')
      return { stereotype: 'trace', label: sourceType === 'testcase' ? 'Executed In (TC → Run)' : 'Runs Test (Run → TC)', endpoint: 'run-link' };
    // TR ↔ Defect
    if (pair === 'defect-testrun')
      return { stereotype: 'trace', label: sourceType === 'testrun' ? 'Found Defect (Run → Defect)' : 'Found In (Defect → Run)', endpoint: 'defect-link' };
    // Everything else is INVALID
    return null;
  };

  const onConnect = (params) => {
    const sourceType = getNodeType(params.source);
    const targetType = getNodeType(params.target);
    const linkInfo = getSmartLinkInfo(sourceType, targetType);
    if (!linkInfo) {
      setMsg(`❌ Cannot link ${sourceType} → ${targetType}. Allowed: Req↔Req, Req↔TC, TC↔Run, Run↔Defect`);
      setTimeout(() => setMsg(''), 4000);
      return;
    }
    setLinkModal({ sourceId: params.source, targetId: params.target, linkInfo });
    setLinkStereotype(linkInfo.stereotype);
    setMsg(`Creating: ${linkInfo.label}`);
  };

  const onBpNodeClick = (event, node) => {
    setSelectedBpNode(node);
    setBpEditForm({ ...node.data });
  };

  const saveBpNodeEdit = async () => {
    if (!selectedBpNode || !currentProject) return;
    const { type, id } = selectedBpNode;
    try {
      if (type === 'requirement') {
        await axios.post(`${API_BASE}/`, { id, project_id: currentProject.id, title: bpEditForm.title || '', description: bpEditForm.description || '', type: bpEditForm.type || 'Functional', status: bpEditForm.status || 'Proposed', version: bpEditForm.version || '1.0', component: bpEditForm.component || '' });
      } else if (type === 'testcase') {
        await axios.post(`${API_BASE}/testcases`, { id, project_id: currentProject.id, title: bpEditForm.title || '', steps: bpEditForm.steps || '', expected_result: bpEditForm.expected_result || '', status: bpEditForm.status || 'Draft', custom_data: { requirement_id: bpEditForm.requirement_id || '' } });
      } else if (type === 'testrun') {
        await axios.post(`${API_BASE}/testruns`, { id, project_id: currentProject.id, date: bpEditForm.date || new Date().toISOString().split('T')[0], result: bpEditForm.result || 'Pass', executed_by: bpEditForm.executed_by || 'User', testcase_id: bpEditForm.testcase_id || '' });
      } else if (type === 'defect') {
        await axios.post(`${API_BASE}/defects`, { id, project_id: currentProject.id, title: bpEditForm.title || '', severity: bpEditForm.severity || 'Medium', status: bpEditForm.status || 'Open' });
      } else if (type === 'block') {
        await axios.post(`${API_BASE}/blocks`, { id, project_id: currentProject.id, name: bpEditForm.name || '', description: bpEditForm.description || '', block_type: bpEditForm.block_type || 'Component' });
      }
      // Update the node data on canvas
      setBpNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, ...bpEditForm } } : n));
      setMsg(`Saved ${type}: ${id}`);
      setSelectedBpNode(null);
      fetchDashboard();
      setTimeout(() => setMsg(''), 3000);
    } catch (err) { alert('Save failed: ' + (err.response?.data?.detail || err.message)); }
  };

  const createBlueprintNode = async (type) => {
    if (!currentProject) return;
    const rand = Math.floor(Math.random() * 9000 + 1000);
    const prefixMap = { requirement: 'REQ', testcase: 'TC', testrun: 'TR', defect: 'DEF', block: 'BLK' };
    const id = `${prefixMap[type]}-${rand}`;
    try {
      if (type === 'requirement') {
        await axios.post(`${API_BASE}/`, { id, title: 'New Requirement', project_id: currentProject.id, type: 'Functional', status: 'Proposed', version: '1.0' });
      } else if (type === 'testcase') {
        await axios.post(`${API_BASE}/testcases`, { id, title: 'New Test Case', project_id: currentProject.id, steps: '', expected_result: '', status: 'Draft' });
      } else if (type === 'testrun') {
        await axios.post(`${API_BASE}/testruns`, { id, project_id: currentProject.id, date: new Date().toISOString().split('T')[0], result: 'Pass', executed_by: 'User' });
      } else if (type === 'defect') {
        await axios.post(`${API_BASE}/defects`, { id, title: 'New Defect', project_id: currentProject.id, severity: 'Medium', status: 'Open' });
      } else {
        await axios.post(`${API_BASE}/blocks`, { id, name: 'New Block', project_id: currentProject.id, block_type: 'Component' });
      }
      setMsg(`Created ${type}: ${id}`);
      const newNode = {
        id, type,
        position: { x: 100 + Math.random() * 600, y: 100 + Math.random() * 400 },
        data: { id, title: `New ${type}`, name: `New ${type}`, result: type === 'testrun' ? 'Pass' : undefined },
      };
      setBpNodes((nds) => nds.concat(newNode));
      fetchDashboard();
    } catch (err) {
      alert('Node creation failed: ' + (err.response?.data?.detail || err.message));
    }
  };

  useEffect(() => {
    if (view === 'blueprint' && currentProject) {
      // Layout in rows by type
      const yPos = { requirement: 50, testcase: 200, testrun: 350, defect: 500, block: 50 };
      let reqX = 50, tcX = 50, trX = 50, defX = 50, blkX = 500;
      const nodes = [
        ...dashboardReqs.map(r => ({ id: r.id, type: 'requirement', data: { id: r.id, title: r.title }, position: { x: (reqX += 200) - 200, y: yPos.requirement } })),
        ...dashboardTcs.map(t => ({ id: t.id, type: 'testcase', data: { id: t.id, title: t.title }, position: { x: (tcX += 200) - 200, y: yPos.testcase } })),
        ...dashboardRuns.map(r => ({ id: r.id, type: 'testrun', data: { id: r.id, result: r.result }, position: { x: (trX += 200) - 200, y: yPos.testrun } })),
        ...dashboardBlocks.map(b => ({ id: b.id, type: 'block', data: { id: b.id, name: b.name }, position: { x: (blkX += 200) - 200, y: yPos.block } }))
      ];
      setBpNodes(nodes);
      setBpEdges([]);
    }
  }, [view, currentProject, dashboardReqs, dashboardTcs, dashboardRuns, dashboardBlocks]);

  const sidebarBtnStyle = (active) => ({
    display: 'flex', alignItems: 'center', width: '100%', padding: '0.75rem 1rem', borderRadius: '0.5rem',
    background: active ? 'rgba(249, 115, 22, 0.12)' : 'transparent',
    color: active ? '#fb923c' : '#94a3b8',
    border: active ? '1px solid rgba(249, 115, 22, 0.2)' : '1px solid transparent',
    fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.25s ease', marginBottom: '0.25rem'
  });

  return (
    <div className="container" style={{ display: 'flex', minHeight: '100vh', padding: 0, background: '#060a14' }}>
      {/* GLOBAL SIDEBAR */}
      <aside style={{ width: '260px', background: 'linear-gradient(180deg, #0d1326 0%, #0a0e1a 100%)', color: 'white', display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, height: '100vh', borderRight: '1px solid rgba(59, 84, 152, 0.2)' }}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid rgba(59, 84, 152, 0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ background: 'linear-gradient(135deg, #f97316 0%, #e05e00 100%)', color: 'white', padding: '3px 8px', borderRadius: '6px', fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.05em', boxShadow: '0 2px 8px rgba(249, 115, 22, 0.3)' }}>ALM</div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 900, letterSpacing: '-0.02em', background: 'linear-gradient(135deg, #f8fafc 0%, #94a3b8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>QMS Pro</h2>
          </div>
        </div>

        <nav style={{ flex: 1, padding: '1rem' }}>
          <div style={{ marginBottom: '1.5rem' }}>
            <p style={{ fontSize: '0.6rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '0.5rem', paddingLeft: '0.5rem' }}>Navigation</p>
            <button style={sidebarBtnStyle(view === 'home')} onClick={() => setView("home")}>🏠 Projects</button>
            <button style={sidebarBtnStyle(view === 'all-reqs')} onClick={() => { setView("all-reqs"); fetchAllReqs(); }}>📊 All Requirements</button>
          </div>

          {currentProject && (
            <div>
              <p style={{ fontSize: '0.6rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '0.5rem', paddingLeft: '0.5rem' }}>{currentProject.id} Workspace</p>
              <button style={sidebarBtnStyle(view === 'alm')} onClick={() => setView("alm")}>🛠️ ALM Dashboard</button>
              <button style={sidebarBtnStyle(view === 'blueprint')} onClick={() => setView("blueprint")}>📐 SysML Blueprint</button>
              <button style={sidebarBtnStyle(false)} onClick={() => setWizardStep(1) || setView("create-project")}>⚙️ Config Wizard</button>
            </div>
          )}
        </nav>

        <div style={{ padding: '1.2rem', borderTop: '1px solid rgba(59, 84, 152, 0.2)' }}>
          <button className="primary-button mini-btn" style={{ width: '100%', margin: 0 }} onClick={() => { setProjForm({ id: "", name: "", description: "", components: [""], types: ["Hardware", "Software", "System"], custom_fields: [] }); setWizardStep(1); setView("create-project"); }}>+ New Project</button>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#0a0e1a' }}>
        <header style={{ borderBottom: '1px solid rgba(59, 84, 152, 0.2)', background: 'rgba(13, 19, 38, 0.8)', backdropFilter: 'blur(12px)', padding: '0.75rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#f8fafc' }}>
              {view === "home" ? "Projects Overview" : view === "all-reqs" ? "Requirement Intelligence" : view === "create-project" ? "Project Setup" : `${currentProject?.name} Dashboard`}
            </h1>
            <p style={{ fontSize: '0.75rem', color: '#64748b' }}>{view === "create-project" ? "Wizard" : currentProject ? `Active: ${currentProject.id}` : "Global Management"}</p>
          </div>
          {view === "alm" && (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <div className="tab-btn-group" style={{ background: 'rgba(17, 26, 51, 0.8)', padding: '0.2rem', borderRadius: '0.5rem', border: '1px solid rgba(59, 84, 152, 0.3)' }}>
                <button className={`tab-btn mini-btn ${viewMode === 'graph' ? 'active' : ''}`} onClick={() => setViewMode('graph')}>Graph</button>
                <button className={`tab-btn mini-btn ${viewMode === 'list' ? 'active' : ''}`} onClick={() => { setViewMode('list'); fetchDashboard(); }}>List</button>
              </div>
              <input className="modern-input" placeholder="Search ID..." value={reqId} onChange={e => setReqId(e.target.value.toUpperCase())} />
              <button className="primary-button" onClick={() => fetchGraph()}>Search</button>
            </div>
          )}
        </header>

        <div style={{ padding: '2rem', flex: 1, overflowY: 'auto' }}>
          {view === "home" && (
            <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
              <div style={{ background: 'linear-gradient(135deg, #162040 0%, #0d1326 50%, #0c1020 100%)', color: 'white', padding: '2.5rem', borderRadius: '1.25rem', marginBottom: '2rem', border: '1px solid rgba(59, 84, 152, 0.25)', boxShadow: '0 0 40px rgba(6, 182, 212, 0.08)', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: '-50%', right: '-10%', width: '300px', height: '300px', background: 'radial-gradient(circle, rgba(249, 115, 22, 0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
                <h2 style={{ fontSize: '1.6rem', fontWeight: 900, letterSpacing: '-0.02em', marginBottom: '0.5rem' }}>Global Health Summary</h2>
                <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Monitor {allReqs.length} requirements across {projects.length} subsystems.</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
                {projects.map(p => (
                  <div key={p.id} className="cursor-pointer" style={{ background: 'rgba(13, 19, 38, 0.7)', backdropFilter: 'blur(12px)', padding: '1.5rem', borderRadius: '1rem', border: '1px solid rgba(59, 84, 152, 0.25)', boxShadow: '0 4px 16px rgba(0,0,0,0.3)', transition: 'all 0.3s ease' }} onClick={() => { setCurrentProject(p); setView("alm"); }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(249, 115, 22, 0.4)'; e.currentTarget.style.boxShadow = '0 0 24px rgba(249, 115, 22, 0.12)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(59, 84, 152, 0.25)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.3)'; }}>
                    <div className="status-badge status-other" style={{ marginBottom: '1rem' }}>{p.id}</div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc' }}>{p.name}</h3>
                    <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '1rem' }}>{p.description}</p>
                    <div style={{ borderTop: '1px solid rgba(59, 84, 152, 0.2)', paddingTop: '1rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 600 }}>
                      <span style={{ color: '#34d399' }}>{allReqs.filter(r => r.project_id === p.id && r.fulfillment === 'Passing').length} Pass</span>
                      <span style={{ color: '#f87171' }}>{allReqs.filter(r => r.project_id === p.id && r.fulfillment === 'Failing').length} Fail</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {view === "all-reqs" && (
            <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
              <div style={{ background: 'rgba(13, 19, 38, 0.7)', backdropFilter: 'blur(12px)', padding: '1.5rem', borderRadius: '1rem', border: '1px solid rgba(59, 84, 152, 0.25)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f8fafc' }}>Global Requirement Register</h2>
                  <input className="modern-input" placeholder="Search ID, Title, Project..." style={{ width: '300px' }} onChange={e => setListSearch(e.target.value)} />
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ background: 'rgba(17, 26, 51, 0.6)' }}>
                    <tr>
                      <th style={{ padding: '0.75rem', textAlign: 'left', color: '#94a3b8', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Project</th>
                      <th style={{ padding: '0.75rem', textAlign: 'left', color: '#94a3b8', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>ID</th>
                      <th style={{ padding: '0.75rem', textAlign: 'left', color: '#94a3b8', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Title</th>
                      <th style={{ padding: '0.75rem', textAlign: 'left', color: '#94a3b8', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Fulfillment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allReqs.filter(r => r.id.includes(listSearch) || r.project_id.includes(listSearch) || r.title.toLowerCase().includes(listSearch.toLowerCase())).map(r => (
                      <tr key={r.project_id + r.id} style={{ borderBottom: '1px solid rgba(59, 84, 152, 0.15)' }}>
                        <td style={{ padding: '0.75rem', fontWeight: 600, color: '#64748b' }}>{r.project_id}</td>
                        <td style={{ padding: '0.75rem', fontWeight: 800, color: '#fb923c', cursor: 'pointer' }} onClick={() => { navigateToProject(r); setTimeout(() => fetchGraph(r.id), 100); }}>{r.id}</td>
                        <td style={{ padding: '0.75rem', color: '#e2e8f0' }}>{r.title}</td>
                        <td style={{ padding: '0.75rem' }}>
                          <span className={`status-badge ${r.fulfillment === 'Passing' ? 'status-pass' : 'status-fail'}`}>{r.fulfillment}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {view === "alm" && (
            <div className="main-layout" style={{ display: 'flex', gap: '2rem' }}>
              <aside className="sidebar" style={{ width: '350px' }}>
                <div className="tab-switcher" style={{ marginBottom: '1.5rem' }}>
                  <button className={`tab-btn ${activeTab === 'requirement' ? 'active' : ''}`} onClick={() => setActiveTab('requirement')}>REQ</button>
                  <button className={`tab-btn ${activeTab === 'testcase' ? 'active' : ''}`} onClick={() => setActiveTab('testcase')}>TC</button>
                  <button className={`tab-btn ${activeTab === 'run' ? 'active' : ''}`} onClick={() => setActiveTab('run')}>RUN</button>
                  <button className={`tab-btn ${activeTab === 'block' ? 'active' : ''}`} onClick={() => setActiveTab('block')}>ARCH</button>
                </div>

                {/* Excel Import UI */}
                <div style={{ marginBottom: '1.5rem', background: 'rgba(17, 26, 51, 0.6)', padding: '1rem', borderRadius: '0.75rem', border: '1px solid rgba(59, 84, 152, 0.25)' }}>
                  <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', marginBottom: '0.5rem', letterSpacing: '0.05em' }}>Bulk Operations</p>
                  <div className="import-section" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <select className="form-select mini-btn" style={{ margin: 0, flex: 1 }} value={importType} onChange={e => setImportType(e.target.value)}>
                      <option value="auto">Auto-Detect</option>
                      <option value="requirement">Requirements</option>
                      <option value="testcase">Test Cases</option>
                      <option value="traceability">Traceability</option>
                    </select>
                    <label className="primary-button mini-btn" style={{ margin: 0, cursor: 'pointer' }}>
                      {importing ? "..." : "Import"}
                      <input type="file" accept=".xlsx, .xls" style={{ display: 'none' }} onChange={handleImport} />
                    </label>
                  </div>
                </div>

                {/* Advanced Import Wizard Overlay */}
                {importStatus !== "idle" && (
                  <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(6, 10, 20, 0.9)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
                    <div style={{ background: 'linear-gradient(180deg, #111a33 0%, #0d1326 100%)', padding: '2.5rem', borderRadius: '1.5rem', maxWidth: '600px', width: '100%', maxHeight: '90vh', overflowY: 'auto', border: '1px solid rgba(59, 84, 152, 0.3)', boxShadow: '0 0 60px rgba(0,0,0,0.5), 0 0 30px rgba(249, 115, 22, 0.05)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f8fafc' }}>Excel Import Wizard</h2>
                        <button className="mini-btn secondary-button" onClick={() => setImportStatus("idle")}>Cancel</button>
                      </div>

                      {importStatus === "inspecting" && (
                        <div style={{ textAlign: 'center', padding: '2rem' }}>
                          <div className="spinner" style={{ margin: '0 auto 1rem' }}></div>
                          <p>Analyzing Excel structure...</p>
                        </div>
                      )}

                      {importStatus === "mapping" && inspectData && (
                        <div className="fade-in">
                          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <div style={{ flex: 1 }}>
                              <p style={{ marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.8rem' }}>1. Select Sheet</p>
                              <select className="form-select" style={{ margin: 0 }} value={selectedSheet} onChange={e => setSelectedSheet(e.target.value)}>
                                {Object.keys(inspectData).map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                            </div>
                            <div style={{ flex: 1 }}>
                              <p style={{ marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.8rem' }}>2. Import As</p>
                              <select className="form-select" style={{ margin: 0 }} value={importType === "auto" ? "requirement" : importType} onChange={e => setImportType(e.target.value)}>
                                <option value="requirement">Requirements</option>
                                <option value="testcase">Test Cases</option>
                                <option value="testrun">Test Runs</option>
                              </select>
                            </div>
                          </div>

                          <div style={{ marginTop: '2rem' }}>
                            <p style={{ marginBottom: '1rem', fontWeight: 700 }}>3. Map Columns</p>
                            <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '1rem' }}>Map Excel headers to QMS fields.</p>

                            {(importType === "testcase" ? [
                              { id: "id", label: "TC ID (Unique)*" },
                              { id: "title", label: "Title*" },
                              { id: "steps", label: "Steps" },
                              { id: "expected_result", label: "Expected Result" },
                              { id: "requirement_id", label: "Requirement IDs (comma separated)" },
                              { id: "status", label: "Status" }
                            ] : importType === "testrun" ? [
                              { id: "id", label: "Run ID (Unique)*" },
                              { id: "date", label: "Date" },
                              { id: "result", label: "Result (Pass/Fail)" },
                              { id: "executed_by", label: "Executed By" }
                            ] : [
                              { id: "id", label: "Req ID (Unique)*" },
                              { id: "title", label: "Title*" },
                              { id: "description", label: "Description" },
                              { id: "type", label: "Type" },
                              { id: "status", label: "Status" }
                            ]).map(field => (
                              <div key={field.id} style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <label style={{ fontSize: '0.85rem', fontWeight: 600, width: '180px' }}>{field.label}</label>
                                <select className="form-select" style={{ margin: 0, flex: 1 }}
                                  value={fieldMapping[field.id]}
                                  onChange={e => setFieldMapping({ ...fieldMapping, [field.id]: e.target.value })}>
                                  <option value="">-- Ignore / Select Column --</option>
                                  {inspectData[selectedSheet]?.map(col => <option key={col} value={col}>{col}</option>)}
                                </select>
                              </div>
                            ))}
                          </div>

                          <div style={{ marginTop: '2.5rem', borderTop: '1px solid #f1f5f9', paddingTop: '1.5rem' }}>
                            <button className="primary-button" style={{ width: '100%' }} onClick={handleMappedImport} disabled={importStatus === "processing"}>
                              {importStatus === "processing" ? "Importing..." : "Execute Import"}
                            </button>
                          </div>
                        </div>
                      )}

                      {importStatus === "processing" && (
                        <div style={{ textAlign: 'center', padding: '2rem' }}>
                          <div className="spinner" style={{ margin: '0 auto 1rem' }}></div>
                          <p>Importing requirements... Please wait.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {activeTab === 'requirement' && (
                  <form className="form-card" onSubmit={handleCreateRequirement}>
                    <h3>New Requirement</h3>
                    <input className="form-input" placeholder="ID" value={reqForm.id} onChange={e => setReqForm({ ...reqForm, id: e.target.value })} required />
                    <input className="form-input" placeholder="Title" value={reqForm.title} onChange={e => setReqForm({ ...reqForm, title: e.target.value })} required />
                    <textarea className="form-input" placeholder="Description" value={reqForm.description} onChange={e => setReqForm({ ...reqForm, description: e.target.value })} />
                    <select className="form-select" value={reqForm.type} onChange={e => setReqForm({ ...reqForm, type: e.target.value })}>
                      {currentProject?.config?.types?.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <select className="form-select" value={reqForm.component} onChange={e => setReqForm({ ...reqForm, component: e.target.value })}>
                      <option value="">Component...</option>
                      {currentProject?.config?.components?.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    {currentProject?.config?.custom_fields?.map(f => (
                      <div key={f.label} style={{ marginBottom: '0.5rem' }}>
                        <label style={{ fontSize: '0.7rem' }}>{f.label}</label>
                        <input className="form-input" type={f.type} onChange={e => setReqForm({ ...reqForm, custom_data: { ...reqForm.custom_data, [f.label]: e.target.value } })} />
                      </div>
                    ))}
                    <div className="upstream-section">
                      <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>SysML Links</label>
                      {upTraceIds.map((trace, i) => (
                        <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.25rem' }}>
                          <input className="form-input" style={{ flex: 1 }} placeholder="Target ID" value={trace.id} onChange={e => handleUpTraceChange(i, 'id', e.target.value)} />
                          <select className="form-select" style={{ width: '110px', margin: 0 }} value={trace.stereotype} onChange={e => handleUpTraceChange(i, 'stereotype', e.target.value)}>
                            {SYSML_STEREOTYPES.map(s => <option key={s} value={s}>{`<<${s}>>`}</option>)}
                          </select>
                        </div>
                      ))}
                      <button type="button" className="secondary-button mini-btn" onClick={() => setUpTraceIds([...upTraceIds, { id: "", stereotype: "trace" }])}>+ Link</button>
                    </div>
                    <button className="primary-button" style={{ width: '100%', marginTop: '1rem' }} type="submit">Create Requirement</button>
                  </form>
                )}
                {activeTab === 'block' && (
                  <form className="form-card" onSubmit={handleCreateBlock}>
                    <h3>New Block</h3>
                    <input className="form-input" placeholder="Block ID (e.g. BLK-001)" value={blockForm.id} onChange={e => setBlockForm({ ...blockForm, id: e.target.value })} required />
                    <input className="form-input" placeholder="Name" value={blockForm.name} onChange={e => setBlockForm({ ...blockForm, name: e.target.value })} required />
                    <textarea className="form-input" placeholder="Description" value={blockForm.description} onChange={e => setBlockForm({ ...blockForm, description: e.target.value })} />
                    <select className="form-select" value={blockForm.block_type} onChange={e => setBlockForm({ ...blockForm, block_type: e.target.value })}>
                      <option value="System">System</option>
                      <option value="Product">Product</option>
                      <option value="Component">Component</option>
                      <option value="Part">Part</option>
                    </select>
                    <select className="form-select" value={blockForm.parent_id} onChange={e => setBlockForm({ ...blockForm, parent_id: e.target.value })}>
                      <option value="">No Parent (Top-Level)</option>
                      {dashboardBlocks.map(b => <option key={b.id} value={b.id}>{b.id} — {b.name} ({b.block_type})</option>)}
                    </select>
                    <button className="primary-button" style={{ width: '100%', marginTop: '1rem' }} type="submit">Create Block</button>
                  </form>
                )}
                {activeTab === 'testcase' && (
                  <form className="form-card" onSubmit={handleCreateTestCase}>
                    <h3>New Test Case</h3>
                    <input className="form-input" placeholder="ID" value={tcForm.id} onChange={e => setTcForm({ ...tcForm, id: e.target.value })} required />
                    <input className="form-input" placeholder="Req ID" value={tcForm.requirement_id} onChange={e => setTcForm({ ...tcForm, requirement_id: e.target.value })} />
                    <button className="primary-button" style={{ width: '100%', marginTop: '1rem' }} type="submit">Create</button>
                  </form>
                )}
                {activeTab === 'run' && (
                  <form className="form-card" onSubmit={handleCreateRun}>
                    <h3>Record Run</h3>
                    <input className="form-input" placeholder="Run ID" value={runForm.id} onChange={e => setRunForm({ ...runForm, id: e.target.value })} required />
                    <input className="form-input" placeholder="TC ID" value={runForm.testcase_id} onChange={e => setRunForm({ ...runForm, testcase_id: e.target.value })} required />
                    <input className="form-input" type="date" value={runForm.date} onChange={e => setRunForm({ ...runForm, date: e.target.value })} required />
                    <select className="form-select" value={runForm.result} onChange={e => setRunForm({ ...runForm, result: e.target.value })}>
                      <option value="Pass">Pass</option><option value="Fail">Fail</option>
                    </select>
                    <textarea className="form-input" placeholder="Test Notes/Text" value={runForm.test_text} onChange={e => setRunForm({ ...runForm, test_text: e.target.value })} style={{ minHeight: '80px' }} />
                    <button className="primary-button" style={{ width: '100%', marginTop: '1rem' }} type="submit">Record</button>
                  </form>
                )}
              </aside>

              <main className="dashboard-split">
                {/* LEFT PANE: Lists */}
                <div className="list-pane shadow-sm">
                  <div className="pane-header">
                    <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#f8fafc' }}>{activeTab.toUpperCase()} INDEX</span>
                    <button className="mini-btn secondary-button" style={{ margin: 0 }} onClick={fetchDashboard}>Refresh</button>
                  </div>
                  <div className="pane-content">
                    <table className="compact-table">
                      <thead>
                        {activeTab === 'requirement' && (
                          <tr><th>ID</th><th>Title</th><th>Status</th></tr>
                        )}
                        {activeTab === 'testcase' && (
                          <tr><th>ID</th><th>Title</th><th>Link</th></tr>
                        )}
                        {activeTab === 'run' && (
                          <tr><th>ID</th><th>Date</th><th>Result</th></tr>
                        )}
                        {activeTab === 'block' && (
                          <tr><th>ID</th><th>Name</th><th>Type</th></tr>
                        )}
                      </thead>
                      <tbody>
                        {activeTab === 'requirement' && dashboardReqs.map(r => (
                          <tr key={r.id} style={{ background: reqId === r.id ? 'rgba(249, 115, 22, 0.08)' : 'transparent' }}>
                            <td style={{ fontWeight: 800, color: '#fb923c', cursor: 'pointer' }} onClick={() => fetchGraph(r.id)}>{r.id}</td>
                            <td onDoubleClick={() => handleEditStart(r, 'requirement')}>{r.title}</td>
                            <td><span className={`status-badge ${r.fulfillment === 'Passing' ? 'status-pass' : 'status-fail'}`}>{r.fulfillment}</span></td>
                          </tr>
                        ))}
                        {activeTab === 'testcase' && dashboardTcs.map(t => (
                          <tr key={t.id} style={{ background: reqId === t.id ? 'rgba(249, 115, 22, 0.08)' : 'transparent' }}>
                            <td style={{ fontWeight: 800, color: '#22d3ee', cursor: 'pointer' }} onClick={() => fetchGraph(t.id)}>{t.id}</td>
                            <td onDoubleClick={() => handleEditStart(t, 'testcase')}>{t.title}</td>
                            <td style={{ fontSize: '0.7rem' }}>{t.requirement_id || 'None'}</td>
                          </tr>
                        ))}
                        {activeTab === 'run' && dashboardRuns.map(r => (
                          <tr key={r.id} style={{ background: reqId === r.id ? 'rgba(249, 115, 22, 0.08)' : 'transparent' }}>
                            <td style={{ fontWeight: 800, color: '#34d399', cursor: 'pointer' }} onClick={() => fetchGraph(r.id)}>{r.id}</td>
                            <td>{r.date}</td>
                            <td><span className={`status-badge ${r.result === 'Pass' ? 'status-pass' : 'status-fail'}`}>{r.result}</span></td>
                          </tr>
                        ))}
                        {activeTab === 'block' && dashboardBlocks.map(b => (
                          <tr key={b.id} style={{ background: reqId === b.id ? 'rgba(249, 115, 22, 0.08)' : 'transparent' }}>
                            <td style={{ fontWeight: 800, color: '#c084fc', cursor: 'pointer' }} onClick={() => fetchGraph(b.id)}>{b.id}</td>
                            <td>{b.name}</td>
                            <td><span style={{ fontSize: '0.65rem', padding: '0.15rem 0.5rem', borderRadius: '0.5rem', background: 'rgba(192, 132, 252, 0.15)', color: '#c084fc', fontWeight: 700 }}>{b.block_type}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* RIGHT PANE: Graph */}
                <div className="graph-pane shadow-sm">
                  <div className="pane-header">
                    <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#f8fafc' }}>Traceability Explorer: {reqId || "None"}</span>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="mini-btn secondary-button" style={{ margin: 0 }} onClick={() => cyRef.current?.fit()}>Fit</button>
                      <button className="mini-btn secondary-button" style={{ margin: 0 }} onClick={() => { setElements([]); setReqId(""); }}>Clear</button>
                    </div>
                  </div>

                  <div style={{ height: 'calc(100% - 45px)', position: 'relative' }}>
                    {error && (
                      <div className="loading-overlay" style={{ background: 'rgba(10, 14, 26, 0.95)', color: '#f87171', flexDirection: 'column', textAlign: 'center', padding: '2rem' }}>
                        <p style={{ fontWeight: 800 }}>⚠️ {error}</p>
                        <button className="primary-button mini-btn" style={{ marginTop: '1rem' }} onClick={() => fetchGraph()}>Retry</button>
                      </div>
                    )}

                    {!loading && !error && elements.length === 0 && (
                      <div className="loading-overlay" style={{ background: 'rgba(10, 14, 26, 0.9)', textAlign: 'center' }}>
                        <div>
                          <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '1rem' }}>Click an ID in the list to visualize its traceability graph.</p>
                          <div style={{ fontSize: '3rem', opacity: 0.15 }}>🕸️</div>
                        </div>
                      </div>
                    )}

                    {loading && (
                      <div className="loading-overlay">
                        <div className="spinner"></div>
                        <p style={{ marginLeft: '1rem', fontWeight: 600 }}>Analyzing Connections...</p>
                      </div>
                    )}

                    <CytoscapeComponent
                      elements={visibleElements}
                      style={{ width: "100%", height: "100%" }}
                      cy={cy => {
                        cyRef.current = cy;
                        cy.on('tap', 'node', (evt) => {
                          const node = evt.target;
                          const id = node.id();
                          setExpandedNodes(prev => {
                            const next = new Set(prev);
                            if (next.has(id)) next.delete(id);
                            else next.add(id);
                            return next;
                          });
                        });
                      }}
                      stylesheet={[
                        { selector: 'node', style: { label: 'data(label)', width: 80, height: 80, 'font-size': '13px', 'text-max-width': '200px', 'text-valign': 'bottom', 'text-margin-y': '10px', 'color': '#e2e8f0', 'font-weight': 700, 'text-wrap': 'wrap', 'text-outline-width': 2, 'text-outline-color': '#0a0e1a', 'text-outline-opacity': 0.8 } },
                        // Requirement Types — Neon cool tones
                        { selector: 'node[type="Requirement"]', style: { 'background-color': '#1b2a52', 'border-width': 3, 'border-color': '#3b5498', 'shadow-blur': 12, 'shadow-color': '#3b5498', 'shadow-opacity': 0.4 } },
                        { selector: 'node[reqType="Functional"]', style: { 'background-color': '#162040', 'border-color': '#06b6d4', 'shadow-color': '#06b6d4', 'shadow-blur': 15, 'shadow-opacity': 0.5 } },
                        { selector: 'node[reqType="Business"]', style: { 'background-color': '#0c2a1f', 'border-color': '#34d399', 'shadow-color': '#34d399', 'shadow-blur': 15, 'shadow-opacity': 0.5 } },
                        { selector: 'node[reqType="Non-Functional"]', style: { 'background-color': '#2a0e1a', 'border-color': '#f87171', 'shadow-color': '#f87171', 'shadow-blur': 15, 'shadow-opacity': 0.5 } },
                        { selector: 'node[reqType="User Story"]', style: { 'background-color': '#2a1a08', 'border-color': '#f97316', 'shadow-color': '#f97316', 'shadow-blur': 15, 'shadow-opacity': 0.5 } },

                        { selector: 'node[type="TestCase"]', style: { 'background-color': '#1a1a05', 'border-width': 3, 'border-color': '#fbbf24', 'shadow-blur': 15, 'shadow-color': '#fbbf24', 'shadow-opacity': 0.45 } },
                        { selector: 'node[type="TestRun"]', style: { 'background-color': '#05231a', 'border-width': 3, 'border-color': '#34d399', 'shadow-blur': 15, 'shadow-color': '#34d399', 'shadow-opacity': 0.45 } },
                        { selector: 'node[type="Defect"]', style: { 'background-color': '#230505', 'border-width': 3, 'border-color': '#f87171', 'shadow-blur': 15, 'shadow-color': '#f87171', 'shadow-opacity': 0.45 } },
                        // Block / Architecture nodes — diamond shape, purple glow per type
                        { selector: 'node[type="Block"]', style: { shape: 'diamond', 'background-color': '#1a102e', 'border-width': 3, 'border-color': '#a855f7', 'shadow-blur': 15, 'shadow-color': '#a855f7', 'shadow-opacity': 0.5 } },
                        { selector: '.highlighted', style: { 'width': 110, 'height': 110, 'border-width': 6, 'border-color': '#f97316', 'z-index': 100, 'shadow-blur': 30, 'shadow-color': '#f97316', 'shadow-opacity': 0.7 } },
                        { selector: 'edge', style: { 'target-arrow-shape': 'triangle', width: 3, 'line-color': 'rgba(91, 122, 181, 0.5)', 'curve-style': 'bezier', 'target-arrow-color': 'rgba(91, 122, 181, 0.5)', 'label': 'data(label)', 'font-size': '10px', 'color': '#94a3b8', 'text-background-opacity': 0.85, 'text-background-color': '#0a0e1a', 'text-background-padding': '3px' } }
                      ]}
                      layout={{ name: 'breadthfirst', spacingFactor: 2.0, padding: 100 }}
                    />
                  </div>
                </div>
              </main>

              {/* Link Creation Modal */}
              {linkModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(6, 10, 20, 0.9)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ background: 'linear-gradient(180deg, #111a33 0%, #0d1326 100%)', padding: '2rem', borderRadius: '1rem', width: '400px', border: '1px solid rgba(59, 84, 152, 0.3)', boxShadow: '0 0 40px rgba(0,0,0,0.5)' }}>
                    <h3 style={{ fontWeight: 800, color: '#f8fafc', marginBottom: '0.5rem' }}>Create Relationship</h3>
                    {linkModal.linkInfo && <p style={{ color: '#22d3ee', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.75rem' }}>{linkModal.linkInfo.label}</p>}
                    <p style={{ color: '#94a3b8', fontSize: '0.8rem', marginBottom: '1rem' }}>
                      <span style={{ color: '#fb923c', fontWeight: 700 }}>{linkModal.sourceId}</span>
                      {' → '}
                      <span style={{ color: '#22d3ee', fontWeight: 700 }}>{linkModal.targetId}</span>
                    </p>
                    <label className="form-label" style={{ marginBottom: '0.25rem' }}>Stereotype</label>
                    <select className="form-select" value={linkStereotype} onChange={e => setLinkStereotype(e.target.value)} style={{ marginBottom: '1rem' }}>
                      {SYSML_STEREOTYPES.map(s => <option key={s} value={s}>{`<<${s}>>`}</option>)}
                    </select>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="primary-button" style={{ flex: 1 }} onClick={handleCreateLink}>Create Link</button>
                      <button className="secondary-button" style={{ flex: 1 }} onClick={() => setLinkModal(null)}>Cancel</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {view === "blueprint" && (
            <div style={{ display: 'flex', height: 'calc(100vh - 120px)', gap: '0' }}>
              {/* Canvas */}
              <div className="blueprint-container fade-in" style={{ flex: 1, border: '1px solid rgba(59, 84, 152, 0.3)', borderRadius: '1rem 0 0 1rem', overflow: 'hidden' }}>
                <ReactFlow
                  nodes={bpNodes}
                  edges={bpEdges}
                  onNodesChange={onBpNodesChange}
                  onEdgesChange={onBpEdgesChange}
                  onConnect={onConnect}
                  onNodeClick={onBpNodeClick}
                  nodeTypes={nodeTypes}
                  fitView
                >
                  <Background color="#3b5498" gap={20} />
                  <Controls />
                  <Panel position="top-left" className="designer-toolbar">
                    <button className="primary-button mini-btn" onClick={() => createBlueprintNode('requirement')}>+ Req</button>
                    <button className="primary-button mini-btn" style={{ background: 'linear-gradient(135deg, #fbbf24 0%, #d97706 100%)' }} onClick={() => createBlueprintNode('testcase')}>+ TC</button>
                    <button className="primary-button mini-btn" style={{ background: 'linear-gradient(135deg, #34d399 0%, #059669 100%)' }} onClick={() => createBlueprintNode('testrun')}>+ Run</button>
                    <button className="primary-button mini-btn" style={{ background: 'linear-gradient(135deg, #f87171 0%, #dc2626 100%)' }} onClick={() => createBlueprintNode('defect')}>+ Defect</button>
                    <button className="primary-button mini-btn" style={{ background: 'var(--gradient-cool)' }} onClick={() => createBlueprintNode('block')}>+ Block</button>
                    <div style={{ width: '1px', background: 'var(--border-color)', margin: '0 0.5rem' }}></div>
                    <button className="secondary-button mini-btn" onClick={() => { fetchDashboard(); setMsg("Blueprint synced with database."); }}>🔄 Sync</button>
                  </Panel>
                  <Panel position="top-right" style={{ background: 'rgba(17, 26, 51, 0.55)', padding: '0.5rem', borderRadius: '0.5rem', fontSize: '0.75rem', color: '#94a3b8' }}>
                    Tip: Drag between dots to link nodes. Click a node to edit.
                  </Panel>
                </ReactFlow>
              </div>

              {/* Node Edit Panel */}
              {selectedBpNode && (
                <div style={{ width: '340px', background: 'linear-gradient(180deg, #0d1326 0%, #0a0e1a 100%)', borderRadius: '0 1rem 1rem 0', border: '1px solid rgba(59, 84, 152, 0.3)', borderLeft: 'none', padding: '1.25rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#f8fafc' }}>Edit {selectedBpNode.type?.toUpperCase()}</h3>
                    <button onClick={() => setSelectedBpNode(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.2rem' }}>&times;</button>
                  </div>
                  <p style={{ margin: 0, color: '#fb923c', fontWeight: 700, fontSize: '0.85rem' }}>{selectedBpNode.id}</p>

                  {/* Requirement Fields */}
                  {selectedBpNode.type === 'requirement' && (<>
                    <label className="form-label">Title</label>
                    <input className="form-input" value={bpEditForm.title || ''} onChange={e => setBpEditForm({ ...bpEditForm, title: e.target.value })} />
                    <label className="form-label">Description</label>
                    <textarea className="form-input" rows={3} value={bpEditForm.description || ''} onChange={e => setBpEditForm({ ...bpEditForm, description: e.target.value })} />
                    <label className="form-label">Type</label>
                    <select className="form-select" value={bpEditForm.type || 'Functional'} onChange={e => setBpEditForm({ ...bpEditForm, type: e.target.value })}>
                      <option>Functional</option><option>Non-Functional</option><option>Performance</option><option>Safety</option><option>Interface</option>
                    </select>
                    <label className="form-label">Status</label>
                    <select className="form-select" value={bpEditForm.status || 'Proposed'} onChange={e => setBpEditForm({ ...bpEditForm, status: e.target.value })}>
                      <option>Proposed</option><option>Active</option><option>Approved</option><option>Rejected</option>
                    </select>
                    <label className="form-label">Version</label>
                    <input className="form-input" value={bpEditForm.version || '1.0'} onChange={e => setBpEditForm({ ...bpEditForm, version: e.target.value })} />
                    <label className="form-label">Component</label>
                    <input className="form-input" value={bpEditForm.component || ''} onChange={e => setBpEditForm({ ...bpEditForm, component: e.target.value })} />
                  </>)}

                  {/* Test Case Fields */}
                  {selectedBpNode.type === 'testcase' && (<>
                    <label className="form-label">Title</label>
                    <input className="form-input" value={bpEditForm.title || ''} onChange={e => setBpEditForm({ ...bpEditForm, title: e.target.value })} />
                    <label className="form-label">Steps</label>
                    <textarea className="form-input" rows={3} value={bpEditForm.steps || ''} onChange={e => setBpEditForm({ ...bpEditForm, steps: e.target.value })} />
                    <label className="form-label">Expected Result</label>
                    <textarea className="form-input" rows={2} value={bpEditForm.expected_result || ''} onChange={e => setBpEditForm({ ...bpEditForm, expected_result: e.target.value })} />
                    <label className="form-label">Status</label>
                    <select className="form-select" value={bpEditForm.status || 'Draft'} onChange={e => setBpEditForm({ ...bpEditForm, status: e.target.value })}>
                      <option>Draft</option><option>Ready</option><option>Approved</option><option>Deprecated</option>
                    </select>
                    <label className="form-label">Requirement ID</label>
                    <input className="form-input" placeholder="REQ-XXX" value={bpEditForm.requirement_id || ''} onChange={e => setBpEditForm({ ...bpEditForm, requirement_id: e.target.value })} />
                  </>)}

                  {/* Test Run Fields */}
                  {selectedBpNode.type === 'testrun' && (<>
                    <label className="form-label">Date</label>
                    <input className="form-input" type="date" value={bpEditForm.date || ''} onChange={e => setBpEditForm({ ...bpEditForm, date: e.target.value })} />
                    <label className="form-label">Result</label>
                    <select className="form-select" value={bpEditForm.result || 'Pass'} onChange={e => setBpEditForm({ ...bpEditForm, result: e.target.value })}>
                      <option>Pass</option><option>Fail</option><option>Blocked</option><option>Skipped</option>
                    </select>
                    <label className="form-label">Executed By</label>
                    <input className="form-input" value={bpEditForm.executed_by || ''} onChange={e => setBpEditForm({ ...bpEditForm, executed_by: e.target.value })} />
                    <label className="form-label">Test Case ID</label>
                    <input className="form-input" placeholder="TC-XXX" value={bpEditForm.testcase_id || ''} onChange={e => setBpEditForm({ ...bpEditForm, testcase_id: e.target.value })} />
                  </>)}

                  {/* Defect Fields */}
                  {selectedBpNode.type === 'defect' && (<>
                    <label className="form-label">Title</label>
                    <input className="form-input" value={bpEditForm.title || ''} onChange={e => setBpEditForm({ ...bpEditForm, title: e.target.value })} />
                    <label className="form-label">Severity</label>
                    <select className="form-select" value={bpEditForm.severity || 'Medium'} onChange={e => setBpEditForm({ ...bpEditForm, severity: e.target.value })}>
                      <option>Critical</option><option>High</option><option>Medium</option><option>Low</option>
                    </select>
                    <label className="form-label">Status</label>
                    <select className="form-select" value={bpEditForm.status || 'Open'} onChange={e => setBpEditForm({ ...bpEditForm, status: e.target.value })}>
                      <option>Open</option><option>In Progress</option><option>Fixed</option><option>Closed</option><option>Rejected</option>
                    </select>
                  </>)}

                  {/* Block Fields */}
                  {selectedBpNode.type === 'block' && (<>
                    <label className="form-label">Name</label>
                    <input className="form-input" value={bpEditForm.name || ''} onChange={e => setBpEditForm({ ...bpEditForm, name: e.target.value })} />
                    <label className="form-label">Description</label>
                    <textarea className="form-input" rows={3} value={bpEditForm.description || ''} onChange={e => setBpEditForm({ ...bpEditForm, description: e.target.value })} />
                    <label className="form-label">Block Type</label>
                    <select className="form-select" value={bpEditForm.block_type || 'Component'} onChange={e => setBpEditForm({ ...bpEditForm, block_type: e.target.value })}>
                      <option>System</option><option>Product</option><option>Component</option><option>Part</option>
                    </select>
                  </>)}

                  <button className="primary-button" style={{ marginTop: '0.5rem' }} onClick={saveBpNodeEdit}>💾 Save Changes</button>
                </div>
              )}
            </div>
          )}

          {view === "create-project" && (
            <div style={{ maxWidth: '600px', margin: '0 auto', background: 'rgba(13, 19, 38, 0.7)', backdropFilter: 'blur(16px)', padding: '2.5rem', borderRadius: '1rem', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', border: '1px solid rgba(59, 84, 152, 0.25)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f8fafc' }}>Project Wizard</h2>
                <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600 }}>Step {wizardStep} of 4</span>
              </div>

              {wizardStep === 1 && (
                <div className="fade-in">
                  <label className="form-label">Core Identity</label>
                  <input className="form-input" placeholder="Project ID (CODE)" value={projForm.id} onChange={e => setProjForm({ ...projForm, id: e.target.value.toUpperCase() })} />
                  <input className="form-input" style={{ marginTop: '1rem' }} placeholder="Project Name" value={projForm.name} onChange={e => setProjForm({ ...projForm, name: e.target.value })} />
                  <textarea className="form-input" style={{ marginTop: '1rem' }} placeholder="Description" value={projForm.description} onChange={e => setProjForm({ ...projForm, description: e.target.value })} />
                </div>
              )}
              {wizardStep === 2 && (
                <div className="fade-in">
                  <label className="form-label">Subsystems / Components</label>
                  {projForm.components.map((c, i) => (
                    <input key={i} className="form-input" style={{ marginBottom: '0.5rem' }} value={c} onChange={e => {
                      const cpy = [...projForm.components]; cpy[i] = e.target.value; setProjForm({ ...projForm, components: cpy });
                    }} placeholder="Component Name" />
                  ))}
                  <button className="secondary-button" onClick={() => setProjForm({ ...projForm, components: [...projForm.components, ""] })}>+ Add</button>
                </div>
              )}
              {wizardStep === 3 && (
                <div className="fade-in">
                  <label className="form-label">Requirement Types</label>
                  <input className="form-input" value={projForm.types.join(", ")} onChange={e => setProjForm({ ...projForm, types: e.target.value.split(",").map(t => t.trim()) })} placeholder="Functional, Safety, Security..." />
                </div>
              )}
              {wizardStep === 4 && (
                <div className="fade-in">
                  <label className="form-label">Custom Fields</label>
                  {projForm.custom_fields.map((f, i) => (
                    <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <input className="form-input" placeholder="Field Label" value={f.label} onChange={e => {
                        const cpy = [...projForm.custom_fields]; cpy[i].label = e.target.value; setProjForm({ ...projForm, custom_fields: cpy });
                      }} />
                      <select className="form-select" value={f.type} onChange={e => {
                        const cpy = [...projForm.custom_fields]; cpy[i].type = e.target.value; setProjForm({ ...projForm, custom_fields: cpy });
                      }}>
                        <option value="text">Text</option><option value="number">Number</option><option value="date">Date</option>
                      </select>
                    </div>
                  ))}
                  <button className="secondary-button" onClick={() => setProjForm({ ...projForm, custom_fields: [...projForm.custom_fields, { label: '', type: 'text' }] })}>+ Add Field</button>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '3rem' }}>
                <button className="secondary-button" onClick={() => wizardStep === 1 ? setView("home") : setWizardStep(wizardStep - 1)}>Back</button>
                <button className="primary-button" onClick={() => wizardStep === 4 ? handleCreateProject() : setWizardStep(wizardStep + 1)}>
                  {wizardStep === 4 ? "Finish" : "Next"}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;