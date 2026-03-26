import React, { useState, useRef } from 'react';
import ForceGraph2D from 'react-force-graph-2d';

const API_BASE = 'http://127.0.0.1:5001/api';

export default function App() {
  const [prompt, setPrompt] = useState('');
  const [chat, setChat] = useState([]);
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [loading, setLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);
  const fgRef = useRef();

  const handleQuery = async (e) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setLoading(true);
    setGraphData({ nodes: [], links: [] }); 
    setSelectedNode(null);

    const userMsg = { role: 'user', content: prompt };
    setChat(prev => [...prev, userMsg]);
    
    try {
      const res = await fetch(`${API_BASE}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });
      
      const data = await res.json();
      if (res.status === 429) {
        setChat(prev => [...prev, { role: 'system', content: data.error, isError: true }]);
        setLoading(false);
        return;
      }

      const isRejected = data.answer && data.answer.includes("This system is designed to answer questions related to the provided dataset only.");
      setChat(prev => [...prev, { role: 'system', content: data.answer, isWarning: isRejected }]);

      if (data.graph && data.graph.nodes && data.graph.nodes.length > 0) {
        setGraphData({
          nodes: data.graph.nodes.map(n => ({ ...n, id: String(n.id) })), 
          links: (data.graph.links || []).map(e => ({ source: String(e.source), target: String(e.target), label: e.label || '' }))
        });
        setTimeout(() => fgRef.current?.zoomToFit(400, 50), 600);
      }

    } catch (err) {
      console.error(err);
      setChat(prev => [...prev, { role: 'system', content: `Error: ${err.message}`, isError: true }]);
    } finally {
      setLoading(false);
      setPrompt('');
    }
  };

  const handleNodeClick = async (node) => {
    setSelectedNode(node);
    
    // Feature 2: Expand on Click
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/expand`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId: node.id, nodeType: node.type })
      });
      const data = await res.json();
      
      if (data.nodes && data.nodes.length > 0) {
        setGraphData(prev => {
          const existingNodeIds = new Set(prev.nodes.map(n => n.id));
          const newNodes = data.nodes.filter(n => !existingNodeIds.has(String(n.id)));
          
          return {
            nodes: [...prev.nodes, ...newNodes.map(n => ({ ...n, id: String(n.id) }))],
            links: [...prev.links, ...(data.links || []).map(e => ({ 
              source: String(e.source), target: String(e.target), label: e.label || '' 
            }))]
          };
        });
      }
    } catch (err) {
      console.error("Expand error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-gray-100 font-sans overflow-hidden">
      {/* Sidebar */}
      <div className="w-1/3 min-w-[350px] max-w-[500px] flex flex-col bg-white border-r border-gray-300 shadow-lg z-10">
        <div className="p-4 bg-blue-600 text-white font-bold text-lg shadow-md flex justify-between items-center">
          <span>SAP O2C Intelligence</span>
          {loading && <div className="text-xs bg-blue-500 px-2 py-1 rounded animate-pulse">Thinking...</div>}
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
          {chat.length === 0 && (
            <div className="text-gray-400 text-center mt-10">
              <p className="font-semibold">Start Exploring</p>
              <p className="text-xs mt-2">Try: "Trace flow for sales order 3970001859"</p>
            </div>
          )}
          {chat.map((msg, idx) => (
            <div key={idx} className={`p-3 rounded-xl text-sm shadow-sm border ${
              msg.role === 'user' ? 'bg-blue-600 text-white ml-8 border-blue-700' :
              msg.isWarning ? 'bg-amber-100 text-amber-900 mr-8 border-amber-300' :
              msg.isError ? 'bg-red-100 text-red-900 mr-8 border-red-300' :
              'bg-white text-gray-800 mr-8 border-gray-200'
            }`}>
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>
          ))}
        </div>

        <div className="p-4 bg-white border-t border-gray-200">
          <form onSubmit={handleQuery} className="flex gap-2">
            <input
              type="text" value={prompt} onChange={e => setPrompt(e.target.value)}
              placeholder="Ask a question..." className="flex-1 border border-gray-300 rounded-full px-4 py-2 focus:outline-none focus:border-blue-500 shadow-inner"
              disabled={loading}
            />
            <button type="submit" disabled={loading || !prompt.trim()} className="bg-blue-600 text-white p-2 rounded-full hover:bg-blue-700 disabled:opacity-50">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
            </button>
          </form>
        </div>
      </div>

      {/* Main Viewport */}
      <div className="flex-1 relative bg-gray-900 overflow-hidden">
        {/* Feature 1: Inspector Panel */}
        {selectedNode && (
          <div className="absolute top-4 right-4 z-20 w-64 bg-white/95 backdrop-blur shadow-2xl rounded-lg p-4 border border-blue-200 animate-in fade-in slide-in-from-right-4">
             <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-blue-600">{selectedNode.type}</span>
                <button onClick={() => setSelectedNode(null)} className="text-gray-400 hover:text-gray-600">×</button>
             </div>
             <h3 className="text-lg font-bold text-gray-900 border-b pb-2 mb-3">{selectedNode.label || selectedNode.id}</h3>
             <div className="space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-gray-500">Node ID:</span> <span className="font-mono text-gray-800">{selectedNode.id}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Discovery:</span> <span className="text-green-600 font-bold uppercase tracking-tighter">Verified</span></div>
                <p className="text-[10px] text-gray-400 mt-4 leading-tight italic">* Clicked to expand neighbors. New nodes added automatically.</p>
             </div>
          </div>
        )}

        {/* Legend */}
        {graphData.nodes.length > 0 && (
           <div className="absolute bottom-4 left-4 z-10 bg-white/10 backdrop-blur border border-white/20 p-3 rounded-lg text-xs text-white">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-blue-500"></span> SalesOrder</div>
                <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-green-500"></span> Delivery</div>
                <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-yellow-500"></span> Billing</div>
                <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-red-500"></span> Journal</div>
                <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-purple-500"></span> Product</div>
              </div>
           </div>
        )}

        <ForceGraph2D
          ref={fgRef} graphData={graphData}
          nodeLabel={node => `${node.type}: ${node.label || node.id}`}
          nodeColor={node => {
            const type = node.type?.toLowerCase() || '';
            if (type.includes('sales')) return '#3b82f6';
            if (type.includes('delivery')) return '#22c55e';
            if (type.includes('billing') || type.includes('invoice')) return '#eab308';
            if (type.includes('journal') || type.includes('account')) return '#ef4444';
            if (type.includes('product')) return '#a855f7';
            return '#9ca3af';
          }}
          nodeRelSize={7} linkColor={() => '#4b5563'} linkWidth={2} linkDirectionalArrowLength={4} linkDirectionalArrowRelPos={1}
          onNodeClick={handleNodeClick}
        />
      </div>
    </div>
  );
}
