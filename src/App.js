import React, { useState, useEffect, useRef } from "react";
import CytoscapeComponent from "react-cytoscapejs";
import axios from "axios";
import "./App.css";

// API Base URL
const API_BASE = process.env.REACT_APP_API_BASE || "http://127.0.0.1:8000/requirements";

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

  // Form States
  const [reqForm, setReqForm] = useState(initialReqForm);
  const [tcForm, setTcForm] = useState(initialTcForm);
  const [runForm, setRunForm] = useState(initialRunForm);
  const [upTraceIds, setUpTraceIds] = useState([""]); // Array for multiple parents
  const [importing, setImporting] = useState(false);
  const [importType, setImportType] = useState("auto"); // auto, requirement, testcase, testrun, traceability
  const [viewMode, setViewMode] = useState("graph"); // graph, list
  const [dashboardReqs, setDashboardReqs] = useState([]);
  const [dashboardTcs, setDashboardTcs] = useState([]);
  const [dashboardRuns, setDashboardRuns] = useState([]);
  const [listSearch, setListSearch] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);

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
    setReqForm(initialReqForm); setTcForm(initialTcForm); setRunForm(initialRunForm);
    setUpTraceIds([""]); setMsg("");
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
      const [reqs, tcs, runs] = await Promise.all([
        axios.get(`${API_BASE}/dashboard/list${projectParam}`),
        axios.get(`${API_BASE}/testcases/dashboard/list${projectParam}`),
        axios.get(`${API_BASE}/testruns/dashboard/list${projectParam}`)
      ]);
      setDashboardReqs(reqs.data);
      setDashboardTcs(tcs.data);
      setDashboardRuns(runs.data);
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
      for (const parentId of upTraceIds) {
        if (parentId.trim()) {
          await axios.post(`${API_BASE}/link`, { source_id: reqForm.id, target_id: parentId, link_type: "Trace" });
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

  const handleUpTraceChange = (idx, val) => {
    const newIds = [...upTraceIds]; newIds[idx] = val; setUpTraceIds(newIds);
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
  const sidebarBtnStyle = (active) => ({
    display: 'flex', alignItems: 'center', width: '100%', padding: '0.75rem 1rem', borderRadius: '0.5rem',
    background: active ? '#1e293b' : 'transparent', color: active ? 'white' : '#94a3b8',
    border: 'none', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', marginBottom: '0.25rem'
  });

  return (
    <div className="container" style={{ display: 'flex', minHeight: '100vh', padding: 0 }}>
      {/* GLOBAL SIDEBAR */}
      <aside style={{ width: '240px', background: '#0f172a', color: 'white', display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, height: '100vh' }}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid #1e293b' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div className="status-badge status-pass" style={{ margin: 0, padding: '2px 6px', fontSize: '0.7rem' }}>ALM</div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 800 }}>QMS Pro</h2>
          </div>
        </div>

        <nav style={{ flex: 1, padding: '1rem' }}>
          <div style={{ marginBottom: '1.5rem' }}>
            <p style={{ fontSize: '0.6rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 700, letterSpacing: '0.05em', marginBottom: '0.5rem', paddingLeft: '0.5rem' }}>Navigation</p>
            <button style={sidebarBtnStyle(view === 'home')} onClick={() => setView("home")}>🏠 Projects</button>
            <button style={sidebarBtnStyle(view === 'all-reqs')} onClick={() => { setView("all-reqs"); fetchAllReqs(); }}>📊 All Requirements</button>
          </div>

          {currentProject && (
            <div>
              <p style={{ fontSize: '0.6rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 700, letterSpacing: '0.05em', marginBottom: '0.5rem', paddingLeft: '0.5rem' }}>{currentProject.id} Workspace</p>
              <button style={sidebarBtnStyle(view === 'alm')} onClick={() => setView("alm")}>🛠️ ALM Dashboard</button>
              <button style={sidebarBtnStyle(false)} onClick={() => setWizardStep(1) || setView("create-project")}>⚙️ Config Wizard</button>
            </div>
          )}
        </nav>

        <div style={{ padding: '1.2rem', borderTop: '1px solid #1e293b' }}>
          <button className="primary-button mini-btn" style={{ width: '100%', margin: 0 }} onClick={() => { setProjForm({ id: "", name: "", description: "", components: [""], types: ["Hardware", "Software", "System"], custom_fields: [] }); setWizardStep(1); setView("create-project"); }}>+ New Project</button>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
        <header className="header" style={{ borderBottom: '1px solid #e2e8f0', background: 'white', padding: '0.75rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: '1.2rem', fontWeight: 800 }}>
              {view === "home" ? "Projects Overview" : view === "all-reqs" ? "Requirement Intelligence" : view === "create-project" ? "Project Setup" : `${currentProject?.name} Dashboard`}
            </h1>
            <p style={{ fontSize: '0.75rem', color: '#64748b' }}>{view === "create-project" ? "Wizard" : currentProject ? `Active: ${currentProject.id}` : "Global Management"}</p>
          </div>
          {view === "alm" && (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <div className="tab-btn-group" style={{ background: '#f1f5f9', padding: '0.2rem', borderRadius: '0.5rem' }}>
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
              <div style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)', color: 'white', padding: '2rem', borderRadius: '1rem', marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Global Health Summary</h2>
                <p>Monitor {allReqs.length} requirements across {projects.length} subsystems.</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
                {projects.map(p => (
                  <div key={p.id} className="cursor-pointer" style={{ background: 'white', padding: '1.5rem', borderRadius: '1rem', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0/0.05)' }} onClick={() => { setCurrentProject(p); setView("alm"); }}>
                    <div className="status-badge status-other" style={{ marginBottom: '1rem' }}>{p.id}</div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{p.name}</h3>
                    <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '1rem' }}>{p.description}</p>
                    <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '1rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 600 }}>
                      <span style={{ color: '#10b981' }}>{allReqs.filter(r => r.project_id === p.id && r.fulfillment === 'Passing').length} Pass</span>
                      <span style={{ color: '#ef4444' }}>{allReqs.filter(r => r.project_id === p.id && r.fulfillment === 'Failing').length} Fail</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {view === "all-reqs" && (
            <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
              <div style={{ background: 'white', padding: '1.5rem', borderRadius: '1rem', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Global Requirement Register</h2>
                  <input className="modern-input" placeholder="Search ID, Title, Project..." style={{ width: '300px' }} onChange={e => setListSearch(e.target.value)} />
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ background: '#f8fafc' }}>
                    <tr>
                      <th style={{ padding: '0.75rem', textAlign: 'left' }}>Project</th>
                      <th style={{ padding: '0.75rem', textAlign: 'left' }}>ID</th>
                      <th style={{ padding: '0.75rem', textAlign: 'left' }}>Title</th>
                      <th style={{ padding: '0.75rem', textAlign: 'left' }}>Fulfillment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allReqs.filter(r => r.id.includes(listSearch) || r.project_id.includes(listSearch) || r.title.toLowerCase().includes(listSearch.toLowerCase())).map(r => (
                      <tr key={r.project_id + r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '0.75rem', fontWeight: 600, color: '#64748b' }}>{r.project_id}</td>
                        <td style={{ padding: '0.75rem', fontWeight: 800, color: '#4f46e5', cursor: 'pointer' }} onClick={() => { navigateToProject(r); setTimeout(() => fetchGraph(r.id), 100); }}>{r.id}</td>
                        <td style={{ padding: '0.75rem' }}>{r.title}</td>
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
                </div>

                {/* Excel Import UI */}
                <div style={{ marginBottom: '1.5rem', background: 'white', padding: '1rem', borderRadius: '0.75rem', border: '1px solid #e2e8f0' }}>
                  <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginBottom: '0.5rem' }}>Bulk Operations</p>
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
                  <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
                    <div style={{ background: 'white', padding: '2.5rem', borderRadius: '1.5rem', maxWidth: '600px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Excel Import Wizard</h2>
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
                      <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Up Trace</label>
                      {upTraceIds.map((id, i) => (
                        <input key={i} className="form-input" placeholder="Parent ID" value={id} onChange={e => handleUpTraceChange(i, e.target.value)} />
                      ))}
                      <button type="button" className="secondary-button mini-btn" onClick={() => setUpTraceIds([...upTraceIds, ""])}>+ Trace</button>
                    </div>
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
                    <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#1e293b' }}>{activeTab.toUpperCase()} INDEX</span>
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
                      </thead>
                      <tbody>
                        {activeTab === 'requirement' && dashboardReqs.map(r => (
                          <tr key={r.id} style={{ background: reqId === r.id ? '#f1f5f9' : 'transparent' }}>
                            <td style={{ fontWeight: 800, color: '#4f46e5', cursor: 'pointer' }} onClick={() => fetchGraph(r.id)}>{r.id}</td>
                            <td onDoubleClick={() => handleEditStart(r, 'requirement')}>{r.title}</td>
                            <td><span className={`status-badge ${r.fulfillment === 'Passing' ? 'status-pass' : 'status-fail'}`}>{r.fulfillment}</span></td>
                          </tr>
                        ))}
                        {activeTab === 'testcase' && dashboardTcs.map(t => (
                          <tr key={t.id} style={{ background: reqId === t.id ? '#f1f5f9' : 'transparent' }}>
                            <td style={{ fontWeight: 800, color: '#f59e0b', cursor: 'pointer' }} onClick={() => fetchGraph(t.id)}>{t.id}</td>
                            <td onDoubleClick={() => handleEditStart(t, 'testcase')}>{t.title}</td>
                            <td style={{ fontSize: '0.7rem' }}>{t.requirement_id || 'None'}</td>
                          </tr>
                        ))}
                        {activeTab === 'run' && dashboardRuns.map(r => (
                          <tr key={r.id} style={{ background: reqId === r.id ? '#f1f5f9' : 'transparent' }}>
                            <td style={{ fontWeight: 800, color: '#10b981', cursor: 'pointer' }} onClick={() => fetchGraph(r.id)}>{r.id}</td>
                            <td>{r.date}</td>
                            <td><span className={`status-badge ${r.result === 'Pass' ? 'status-pass' : 'status-fail'}`}>{r.result}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* RIGHT PANE: Graph */}
                <div className="graph-pane shadow-sm">
                  <div className="pane-header">
                    <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#1e293b' }}>Traceability Explorer: {reqId || "None"}</span>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="mini-btn secondary-button" style={{ margin: 0 }} onClick={() => cyRef.current?.fit()}>Fit</button>
                      <button className="mini-btn secondary-button" style={{ margin: 0 }} onClick={() => { setElements([]); setReqId(""); }}>Clear</button>
                    </div>
                  </div>

                  <div style={{ height: 'calc(100% - 45px)', position: 'relative' }}>
                    {error && (
                      <div className="loading-overlay" style={{ background: 'rgba(254, 242, 242, 0.95)', color: '#991b1b', flexDirection: 'column', textAlign: 'center', padding: '2rem' }}>
                        <p style={{ fontWeight: 800 }}>⚠️ {error}</p>
                        <button className="primary-button mini-btn" style={{ marginTop: '1rem' }} onClick={() => fetchGraph()}>Retry</button>
                      </div>
                    )}

                    {!loading && !error && elements.length === 0 && (
                      <div className="loading-overlay" style={{ background: '#fff', textAlign: 'center' }}>
                        <div>
                          <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '1rem' }}>Click an ID in the list to visualize its traceability graph.</p>
                          <div style={{ fontSize: '3rem', opacity: 0.1 }}>🕸️</div>
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
                        { selector: 'node', style: { label: 'data(label)', width: 80, height: 80, 'font-size': '14px', 'text-max-width': '200px', 'text-valign': 'bottom', 'text-margin-y': '10px', 'color': '#111827', 'font-weight': 800, 'text-wrap': 'wrap' } },
                        // Requirement Types Coloring
                        { selector: 'node[type="Requirement"]', style: { 'background-color': '#64748b', 'border-width': 3, 'border-color': '#334155' } }, // Default Slate
                        { selector: 'node[reqType="Functional"]', style: { 'background-color': '#4f46e5', 'border-color': '#3730a3' } }, // Indigo
                        { selector: 'node[reqType="Business"]', style: { 'background-color': '#059669', 'border-color': '#064e3b' } }, // Emerald
                        { selector: 'node[reqType="Non-Functional"]', style: { 'background-color': '#e11d48', 'border-color': '#881337' } }, // Rose
                        { selector: 'node[reqType="User Story"]', style: { 'background-color': '#d97706', 'border-color': '#78350f' } }, // Amber

                        { selector: 'node[type="TestCase"]', style: { 'background-color': '#f59e0b', 'border-width': 3, 'border-color': '#b45309' } },
                        { selector: 'node[type="TestRun"]', style: { 'background-color': '#10b981', 'border-width': 3, 'border-color': '#065f46' } },
                        { selector: 'node[type="Defect"]', style: { 'background-color': '#ef4444', 'border-width': 3, 'border-color': '#991b1b' } },
                        { selector: '.highlighted', style: { 'width': 110, 'height': 110, 'border-width': 8, 'border-color': '#000', 'z-index': 100, 'shadow-blur': 15, 'shadow-color': '#000', 'shadow-opacity': 0.5 } },
                        { selector: 'edge', style: { 'target-arrow-shape': 'triangle', width: 4, 'line-color': '#94a3b8', 'curve-style': 'bezier', 'target-arrow-color': '#94a3b8', 'label': 'data(label)', 'font-size': '10px', 'color': '#64748b', 'text-background-opacity': 0.8, 'text-background-color': '#ffffff' } }
                      ]}
                      layout={{ name: 'breadthfirst', spacingFactor: 2.0, padding: 100 }}
                    />
                  </div>
                </div>
              </main>
            </div>
          )}

          {view === "create-project" && (
            <div style={{ maxWidth: '600px', margin: '0 auto', background: 'white', padding: '2.5rem', borderRadius: '1rem', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Project Wizard</h2>
                <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>Step {wizardStep} of 4</span>
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