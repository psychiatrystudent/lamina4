import React, { useState, useRef, useEffect } from 'react';
import { Plus, Minus, ArrowUpRight, XCircle, Trash2, Type, Save, TextQuote } from 'lucide-react';
import domtoimage from 'dom-to-image';
import microLogo from '../assets/micro.png'; // Add this import
import interFontUrl from '../fonts/Inter_24pt-Medium.ttf';

const TEXT_CONSTANTS = {
  SAVING: 'Salvando...',
  SAVE: 'Salvar',
  PATHOLOGY: 'Patologia',
  MAGNIFICATION: 'Aumento',
  PATHOLOGY_NAME: 'Nome da patologia',
  ENTER_TEXT: 'Digite texto e pressione Enter'
};

const PathologySlideViewer = () => {
  const [view, setView] = useState({ 
    scale: 1, 
    position: { x: 0, y: 0 }, 
    isDragging: false,
    dragStart: { x: 0, y: 0 }
  });
  const [images, setImages] = useState([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [mode, setMode] = useState({ type: null });
  const [arrows, setArrows] = useState([]);
  const [texts, setTexts] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [tempDrawing, setTempDrawing] = useState(null);
  const [editingText, setEditingText] = useState(null);
  const [draggingText, setDraggingText] = useState(null);
  const [originalDimensions, setOriginalDimensions] = useState({ width: 0, height: 0 });
  const [pathology, setPathology] = useState('');
  const [magnification, setMagnification] = useState('');
  const [history, setHistory] = useState({
    past: [],
    present: { arrows: [], texts: [] },
    future: []
  });
  const [fontSize, setFontSize] = useState(14);
  
  const containerRef = useRef();

  // Move TEXT_STYLE inside component to access fontSize
  const TEXT_STYLE = {
    fontFamily: 'InterMedium', // Changed from 'CustomFont'
    fontSize: `${fontSize}px`,
    WebkitFontSmoothing: 'antialiased'
  };

  // Add font-face style to document head
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @font-face {
        font-family: 'InterMedium';
        src: url(${interFontUrl}) format('truetype');
      }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  // 1. Add click outside handler
  useEffect(() => {
    const handleClickOutside = (e) => {
      // Close text editing if clicking outside
      if (editingText && !e.target.closest('input')) {
        handleTextSubmit(editingText.text);
      }
      // Close configuration popups if clicking outside
      if (!e.target.closest('.text-controls') && !e.target.closest('.arrow-controls')) {
        setSelectedItem(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [editingText]);

  const getPointerPosition = (e) => {
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - view.position.x) / view.scale,
      y: (e.clientY - rect.top - view.position.y) / view.scale
    };
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          setOriginalDimensions({
            width: img.naturalWidth,
            height: img.naturalHeight
          });
        };
        img.src = e.target.result;
        
        setImages(prev => [...prev, { 
          file: e.target.result,
          magnification: '4x'
        }]);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    if (!containerRef.current || !images[currentImageIndex]) return;

    const originalView = { ...view };
    
    try {
      setView({ scale: 1, position: { x: 0, y: 0 }, isDragging: false, dragStart: { x: 0, y: 0 } });
      await new Promise(resolve => setTimeout(resolve, 100));

      // Get font data
      const fontResponse = await fetch(interFontUrl);
      const fontBlob = await fontResponse.blob();
      const fontBase64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(fontBlob);
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
      });

      // Generate image
      const dataUrl = await domtoimage.toPng(containerRef.current, {
        quality: 1,
        bgcolor: '#FFFFFF',
        height: originalDimensions.height,
        width: originalDimensions.width,
        filter: (node) => !node.classList?.contains('text-controls'),
      });

      // Create SVG without extra whitespace
      const svgContent = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${originalDimensions.width}" height="${originalDimensions.height}">
<defs>
<style type="text/css">
@font-face {
  font-family: 'InterMedium';
  src: url(data:font/truetype;base64,${fontBase64});
}
</style>
</defs>
<image href="${dataUrl}" x="0" y="0" width="${originalDimensions.width}" height="${originalDimensions.height}"/>
</svg>`;

      const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `${pathology}_${magnification}x.svg`;
      link.href = url;
      link.click();

      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error saving image:', error);
    } finally {
      setView(originalView);
    }
  };

  const handleClick = (e) => {
    if (mode.type === 'text') {
      const pos = getPointerPosition(e);
      setEditingText({ x: pos.x, y: pos.y, text: '', isNew: true });
      e.stopPropagation();
      return;
    }
    if (!e.target.closest('.text-box')) {
      setSelectedItem(null);
    }
  };

  const handleMouseDown = (e) => {
    if (mode.type === 'arrow') {
      const point = getPointerPosition(e);
      setTempDrawing({ start: point, end: point });
      e.stopPropagation();
    } else if (!mode.type && !editingText) {
      setView(prev => ({
        ...prev,
        isDragging: true,
        dragStart: { x: e.clientX - prev.position.x, y: e.clientY - prev.position.y }
      }));
    }
  };

  const handleMouseMove = (e) => {
    if (view.isDragging) {
      setView(prev => ({
        ...prev,
        position: {
          x: e.clientX - prev.dragStart.x,
          y: e.clientY - prev.dragStart.y
        }
      }));
    } else if (tempDrawing) {
      setTempDrawing(prev => ({ ...prev, end: getPointerPosition(e) }));
    }
  };

  const handleMouseUp = () => {
    if (tempDrawing) {
      const dx = tempDrawing.end.x - tempDrawing.start.x;
      const dy = tempDrawing.end.y - tempDrawing.start.y;
      if (Math.sqrt(dx * dx + dy * dy) > 5) {
        setArrows(prev => [...prev, { 
          ...tempDrawing, 
          color: 'black',
          imageIndex: currentImageIndex 
        }]);
        saveToHistory();
      }
      setTempDrawing(null);
    }
    setView(prev => ({ ...prev, isDragging: false }));
  };

  // 2. Fix text size buttons - update handleTextSubmit
  const handleTextSubmit = (text) => {
    if (text.trim() && editingText) {
      if (editingText.isNew) {
        setTexts(prev => [...prev, {
          x: editingText.x,
          y: editingText.y,
          text: text.trim(),
          imageIndex: currentImageIndex,
          fontSize: fontSize // Add initial fontSize
        }]);
      } else {
        setTexts(prev => prev.map((t, i) => 
          i === editingText.index ? { ...t, text: text.trim() } : t
        ));
      }
      saveToHistory();
    }
    setEditingText(null);
    setMode({ type: null });
  };

  const calculateArrowPath = (start, end) => {
    const dx = start.x - end.x;
    const dy = start.y - end.y;
    const angle = Math.atan2(dy, dx);
    
    const arrowHeadLength = 12;
    const tip = { x: start.x, y: start.y };
    const leftPoint = {
      x: start.x - arrowHeadLength * Math.cos(angle + Math.PI/6),
      y: start.y - arrowHeadLength * Math.sin(angle + Math.PI/6)
    };
    const rightPoint = {
      x: start.x - arrowHeadLength * Math.cos(angle - Math.PI/6),
      y: start.y - arrowHeadLength * Math.sin(angle - Math.PI/6)
    };

    return {
      line: `M ${end.x} ${end.y} L ${start.x} ${start.y}`,
      head: `M ${tip.x} ${tip.y} L ${leftPoint.x} ${leftPoint.y} L ${rightPoint.x} ${rightPoint.y} Z`
    };
  };

  const saveToHistory = () => {
    setHistory(prev => ({
      past: [...prev.past, prev.present],
      present: { arrows, texts },
      future: []
    }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 p-8">
      <div className="w-full max-w-5xl mx-auto bg-white/80 backdrop-blur-sm shadow-2xl rounded-2xl p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-center gap-4 mb-8">
          <img 
            src={microLogo} 
            alt="Microscope Logo" 
            className="w-24 h-24 object-contain transition-transform hover:scale-110"
          />
          <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
            Patologia Humanitas
          </h1>
        </div>

        {/* Controls */}
        <div className="flex gap-6 flex-wrap items-center p-4 bg-gray-50/50 rounded-xl backdrop-blur-sm">
          <input 
            type="file" 
            accept="image/*" 
            onChange={handleFileUpload}
            className="flex-1 text-sm text-slate-500 file:mr-4 file:py-2.5 file:px-6 file:rounded-full file:border-0 
              file:text-sm file:font-medium file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100 
              transition-all duration-150 ease-in-out"
          />
          <div className="flex gap-3">
            {[
              [Plus, "", () => setView(prev => ({ ...prev, scale: prev.scale + 0.1 }))],
              [Minus, "", () => setView(prev => ({ ...prev, scale: Math.max(0.5, prev.scale - 0.1) }))],
              [ArrowUpRight, "Seta", () => setMode({ type: mode.type === 'arrow' ? null : 'arrow' })],
              [Type, "Texto", () => setMode({ type: mode.type === 'text' ? null : 'text' })],
              [Save, TEXT_CONSTANTS.SAVE, handleSave]
            ].map(([Icon, label, onClick], i) => (
              <button
                key={i}
                onClick={onClick}
                className={`group flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all duration-150
                  ${(i >= 2 && i < 4 && mode.type === (i === 2 ? 'arrow' : 'text'))
                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-200'
                    : 'bg-white text-purple-700 hover:bg-purple-50 hover:shadow-md'}`}
              >
                <Icon size={18} className="transition-transform group-hover:scale-110" />
                {label && <span className="text-sm font-medium">{label}</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Image Viewer */}
        <div 
          ref={containerRef}
          className="relative w-full h-[45rem] overflow-hidden rounded-tr-2xl rounded-bl-2xl rounded-br-2xl border border-purple-100 
            bg-gradient-to-br from-gray-50 to-white shadow-inner"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onClick={handleClick}
          style={{ 
            cursor: mode.type ? 'crosshair' : view.isDragging ? 'grabbing' : 'grab' 
          }}
        >
          {images[currentImageIndex] && (
            <img src={images[currentImageIndex].file} 
              alt="Slide"
              style={{
                transform: `translate(${view.position.x}px, ${view.position.y}px) scale(${view.scale})`,
                transformOrigin: '0 0'
              }}
              className="absolute transition-transform duration-75"
              draggable="false" />
          )}

          <div className="absolute top-0 left-0 w-full h-full pointer-events-none"
            style={{
              transform: `translate(${view.position.x}px, ${view.position.y}px) scale(${view.scale})`,
              transformOrigin: '0 0'
            }}>
            
            {/* Text elements */}
            {texts
              .filter(text => text.imageIndex === currentImageIndex)
              .map((text, index) => (
                <div key={`text-${index}`}
                  style={{
                    position: 'absolute',
                    left: `${text.x}px`,
                    top: `${text.y}px`,
                    cursor: draggingText?.index === index ? 'grabbing' : 'grab',
                    zIndex: 1000
                  }}
                  className="pointer-events-auto"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    if (!selectedItem || selectedItem.type !== 'text' || selectedItem.index !== index) {
                      setSelectedItem({ type: 'text', index });
                    }
                    if (e.target.closest('.text-controls')) return;
                    setDraggingText({
                      index,
                      startX: e.clientX,
                      startY: e.clientY,
                      originalX: text.x,
                      originalY: text.y
                    });
                  }}
                  onMouseMove={(e) => {
                    if (draggingText?.index === index) {
                      e.stopPropagation();
                      const dx = (e.clientX - draggingText.startX) / view.scale;
                      const dy = (e.clientY - draggingText.startY) / view.scale;
                      setTexts(prev => prev.map((t, i) => 
                        i === index ? {
                          ...t,
                          x: draggingText.originalX + dx,
                          y: draggingText.originalY + dy
                        } : t
                      ));
                    }
                  }}
                  onMouseUp={() => setDraggingText(null)}
                  onMouseLeave={() => setDraggingText(null)}>
                  <div className={`text-box bg-white px-2 py-1 rounded shadow-lg text-purple-800 border ${
                    selectedItem?.type === 'text' && selectedItem.index === index 
                      ? 'border-purple-500' 
                      : 'border-purple-200'
                  }`}
                    style={{ 
                      ...TEXT_STYLE,
                      fontSize: `${text.fontSize || fontSize}px`
                    }}>
                    {text.text}
                    {selectedItem?.type === 'text' && selectedItem.index === index && (
                      <div className="text-controls space-y-2 mt-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-semibold">Tamanho:</span>
                          <div className="flex gap-1">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setTexts(prev => prev.map((t, i) => 
                                  i === index ? { 
                                    ...t, 
                                    fontSize: (t.fontSize || fontSize) - 2 
                                  } : t
                                ));
                              }}
                              className="p-1 bg-purple-50 text-purple-600 rounded hover:bg-purple-100"
                            >
                              <Minus size={14} />
                            </button>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setTexts(prev => prev.map((t, i) => 
                                  i === index ? { 
                                    ...t, 
                                    fontSize: (t.fontSize || fontSize) + 2 
                                  } : t
                                ));
                              }}
                              className="p-1 bg-purple-50 text-purple-600 rounded hover:bg-purple-100"
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingText({ ...text, index, isNew: false });
                            }}
                            className="flex-1 px-2 py-1 text-sm bg-purple-50 text-purple-600 rounded hover:bg-purple-100"
                          >
                            Edit
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setTexts(prev => prev.filter((_, i) => i !== index));
                              setSelectedItem(null);
                            }} 
                            className="flex-1 px-2 py-1 text-sm bg-red-50 text-red-600 rounded hover:bg-red-100"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}

            {/* Text input */}
            {editingText && (
              <div
                style={{
                  position: 'absolute',
                  left: `${editingText.x}px`,
                  top: `${editingText.y}px`,
                  zIndex: 1001
                }}
                className="pointer-events-auto"
                onClick={e => e.stopPropagation()}>
                <input
                  type="text"
                  autoFocus
                  value={editingText.text}
                  onChange={e => setEditingText(prev => ({ ...prev, text: e.target.value }))}
                  style={{ ...TEXT_STYLE }}
                  className="bg-white px-2 py-1 rounded shadow-lg text-purple-800 text-sm border border-purple-200 min-w-[200px]"
                  placeholder={TEXT_CONSTANTS.ENTER_TEXT}
                />
              </div>
            )}

            {/* Arrows */}
            <svg className="absolute top-0 left-0 w-full h-full pointer-events-auto">
              {[...arrows, tempDrawing]
                .filter(arrow => arrow && (!arrow.imageIndex || arrow.imageIndex === currentImageIndex))
                .map((arrow, index) => {
                  const paths = calculateArrowPath(arrow.start, arrow.end);
                  return (
                    <g key={`arrow-${index}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedItem({ type: 'arrow', index });
                      }}
                      style={{ cursor: 'pointer' }}>
                      <path
                        d={paths.line}
                        stroke={arrow.color || 'black'}
                        strokeWidth="2.5"
                        fill="none"
                      />
                      <path
                        d={paths.head}
                        stroke="none"
                        fill={arrow.color || 'black'}
                      />
                      {selectedItem?.type === 'arrow' && selectedItem.index === index && (
                        <foreignObject
                          x={Math.min(arrow.start.x, containerRef.current.clientWidth - 140)}
                          y={Math.min(arrow.start.y, containerRef.current.clientHeight - 160)}
                          width="120"
                          height="100"
                          className="overflow-visible">
                          <div className="bg-white p-2 rounded shadow-lg border border-gray-200">
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-sm font-semibold">Color:</span>
                              <button onClick={() => setSelectedItem(null)} className="text-gray-500 hover:text-gray-700">
                                <XCircle size={16} />
                              </button>
                            </div>
                            {['black', 'red', 'white'].map(color => (
                              <button
                                key={color}
                                onClick={() => {
                                  setArrows(prev => prev.map((a, i) => 
                                    i === index ? { ...a, color } : a
                                  ));
                                }}
                                className={`w-full px-2 py-1 text-sm rounded mb-1 ${
                                  arrow.color === color ? 'bg-purple-100' : 'hover:bg-gray-100'
                                }`}>
                                {color === 'black' ? 'Black' : color === 'red' ? 'Red' : 'White'}
                              </button>
                            ))}
                            <button
                              onClick={() => {
                                setArrows(prev => prev.filter((_, i) => i !== index));
                                setSelectedItem(null);
                              }}
                              className="w-full mt-2 px-2 py-1 text-sm bg-red-50 text-red-600 rounded hover:bg-red-100"
                            >
                              Delete
                            </button>
                          </div>
                        </foreignObject>
                      )}
                    </g>
                  );
                })}
            </svg>
          </div>
        </div>

        {/* Form Fields */}
        <div className="grid grid-cols-3 gap-6 p-6 bg-gray-50/50 rounded-xl backdrop-blur-sm">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-purple-600 mb-2">
              {TEXT_CONSTANTS.PATHOLOGY}
            </label>
            <input
              type="text"
              value={pathology}
              onChange={(e) => setPathology(e.target.value)}
              className="w-full px-4 py-2.5 bg-white/70 border border-purple-100 rounded-xl shadow-sm 
                focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500
                transition-all duration-150 placeholder-purple-200"
              placeholder={TEXT_CONSTANTS.PATHOLOGY_NAME}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-purple-600 mb-2">
              {TEXT_CONSTANTS.MAGNIFICATION}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={magnification}
                onChange={(e) => setMagnification(e.target.value)}
                className="w-24 px-3 py-2.5 bg-white/70 border border-purple-100 rounded-xl shadow-sm
                  focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500
                  transition-all duration-150"
                placeholder="40"
              />
              <span className="text-purple-600 font-medium">x</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PathologySlideViewer;