        class VTT {
            constructor() {
                this.canvas = document.getElementById('mainCanvas');
                this.ctx = this.canvas.getContext('2d');
                this.images = [];
                this.selectedImage = null;
                this.isDragging = false;
                this.isRotating = false;
                this.isScaling = false;
                this.isResizing = false;
                this.resizeHandle = null; // which handle is being dragged
                this.resizeStartState = null;
                this.dragOffset = { x: 0, y: 0 };
                this.currentNameCallback = null;

                // Sidebar toggles
                this.leftSidebarVisible = true;
                this.rightSidebarVisible = true;

                // Space key panning
                this.spacePressed = false;

                // Long press for locked images
                this.longPressTimer = null;
                this.longPressTriggered = false;

                // Canvas pan and zoom
                this.panX = 0;
                this.panY = 0;
                this.zoom = 1;
                this.isPanning = false;
                this.lastPanPoint = { x: 0, y: 0 };

                // Grid
                this.showGrid = false;
                this.gridSize = 50; // 50px = 0.5m

                // Context menu
                this.contextMenu = document.getElementById('contextMenu');

                // Undo for drawings
                this.drawingHistory = [];

                // Triple-click tracking
                this.clickTimes = [];
                this.lastClickedImageId = null;

                // Note editing
                this.currentNoteSize = 'medium';

                // Internal clipboard for Ctrl+C/V
                this.copiedImage = null;

                // Drawing tools
                this.currentTool = 'select';
                this.isDrawing = false;
                this.drawingPaths = [];
                this.currentPath = [];
                this.drawStartPoint = null;
                this.brushSize = 5;
                this.drawColor = '#ff0000';
                this.drawOpacity = 1;

                // Ruler tool (5px = 1 feet)
                this.rulerPoints = [];
                this.pixelsPerFoot = 5;

                // Movement tracking for tokens
                this.movementStart = null;
                this.movementDistance = 0;

                // Floating numbers for dice rolls
                this.floatingNumbers = [];

                this.initCanvas();
                this.setupEventListeners();
                this.loadFromStorage();
                this.render();
                this.updateLayersList();
            }

            initCanvas() {
                const container = document.getElementById('canvasContainer');
                this.canvas.width = container.clientWidth;
                this.canvas.height = container.clientHeight;
            }

            setupEventListeners() {
                // Canvas events - Mouse
                this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
                this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
                this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
                this.canvas.addEventListener('wheel', this.handleWheel.bind(this));
                this.canvas.addEventListener('contextmenu', this.handleContextMenu.bind(this));

                // Canvas events - Touch
                this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
                this.canvas.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
                this.canvas.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: false });

                // Keyboard events
                document.addEventListener('keydown', this.handleKeyDown.bind(this));
                document.addEventListener('keyup', this.handleKeyUp.bind(this));
                
                // Paste event
                document.addEventListener('paste', this.handlePaste.bind(this));

                // Click outside to close context menu
                document.addEventListener('click', (e) => {
                    if (!this.contextMenu.contains(e.target)) {
                        this.hideContextMenu();
                    }
                });

                // Click outside to close modals
                document.addEventListener('click', (e) => {
                    // Close rename modal
                    const renameModal = document.getElementById('renameModal');
                    if (renameModal.classList.contains('active') && e.target === renameModal) {
                        this.cancelRename();
                    }
                    
                    // Close display name modal
                    const displayNameModal = document.getElementById('displayNameModal');
                    if (displayNameModal.classList.contains('active') && e.target === displayNameModal) {
                        this.cancelDisplayName();
                    }
                    
                    // Close HP modal
                    const hpModal = document.getElementById('hpModal');
                    if (hpModal.classList.contains('active') && e.target === hpModal) {
                        this.cancelHP();
                    }
                    
                    // Close note modal
                    const noteModal = document.getElementById('noteModal');
                    if (noteModal.classList.contains('active') && e.target === noteModal) {
                        this.cancelNote();
                    }
                });

                // Window resize
                window.addEventListener('resize', () => {
                    this.initCanvas();
                    this.render();
                });
            }

            handleMouseDown(e) {
                const rect = this.canvas.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;

                // Convert screen coordinates to canvas coordinates
                const canvasX = (x - this.panX) / this.zoom;
                const canvasY = (y - this.panY) / this.zoom;

                // Pan with space key, pan tool, or middle mouse button
                if (this.spacePressed || this.currentTool === 'pan' || e.button === 1) {
                    this.isPanning = true;
                    this.lastPanPoint = { x: e.clientX, y: e.clientY };
                    this.canvas.style.cursor = 'grabbing';
                    return;
                }

                // Right click handled by context menu
                if (e.button === 2) return;

                // Hide context menu on left click
                this.hideContextMenu();

                // Handle ruler tool
                if (this.currentTool === 'ruler') {
                    this.rulerPoints.push({ x: canvasX, y: canvasY });
                    if (this.rulerPoints.length === 2) {
                        const dx = this.rulerPoints[1].x - this.rulerPoints[0].x;
                        const dy = this.rulerPoints[1].y - this.rulerPoints[0].y;
                        const distancePx = Math.sqrt(dx * dx + dy * dy);
                        const distanceFt = distancePx / this.pixelsPerFoot;
                        
                        this.drawingPaths.push({
                            type: 'ruler',
                            start: this.rulerPoints[0],
                            end: this.rulerPoints[1],
                            distancePx: Math.round(distancePx),
                            distanceFt: distanceFt.toFixed(1),
                            color: this.drawColor,
                            size: this.brushSize,
                            opacity: this.drawOpacity
                        });
                        
                        this.rulerPoints = [];
                        this.render();
                        this.saveDrawingState();
                        this.saveToStorage();
                    } else {
                        this.render();
                    }
                    return;
                }

                // Handle other drawing tools
                if (this.currentTool !== 'select' && this.currentTool !== 'pan') {
                    this.isDrawing = true;
                    this.drawStartPoint = { x: canvasX, y: canvasY };
                    
                    if (this.currentTool === 'pen' || this.currentTool === 'eraser') {
                        this.currentPath = [{
                            x: canvasX, y: canvasY,
                            tool: this.currentTool,
                            color: this.drawColor,
                            size: this.brushSize,
                            opacity: this.drawOpacity
                        }];
                    }
                    return;
                }

                // Check if clicking on resize handle of selected UNLOCKED image
                // But make sure no other image is on top blocking the handle
                if (this.selectedImage && !this.selectedImage.locked) {
                    const handle = this.getResizeHandle(canvasX, canvasY, this.selectedImage);
                    if (handle) {
                        // Check if any image is on top of this point
                        let blocked = false;
                        for (let i = this.images.length - 1; i >= 0; i--) {
                            const img = this.images[i];
                            if (img === this.selectedImage) break; // Reached selected image, not blocked
                            if (this.isPointInImage(canvasX, canvasY, img)) {
                                blocked = true; // Another image is on top
                                break;
                            }
                        }
                        
                        if (!blocked) {
                            this.isResizing = true;
                            this.resizeHandle = handle;
                            this.resizeStartState = {
                                x: this.selectedImage.x,
                                y: this.selectedImage.y,
                                scale: this.selectedImage.scale,
                                rotation: this.selectedImage.rotation,
                                mouseX: canvasX,
                                mouseY: canvasY
                            };
                            return;
                        }
                    }
                }

                // Check if clicking on an UNLOCKED image
                // Important: Check from top to bottom, skip locked images
                let clickedImage = null;
                for (let i = this.images.length - 1; i >= 0; i--) {
                    const img = this.images[i];
                    
                    if (this.isPointInImage(canvasX, canvasY, img)) {
                        // Skip locked images - continue checking images below
                        if (img.locked) continue;
                        
                        // Found an unlocked image
                        clickedImage = img;
                        break;
                    }
                }

                if (clickedImage) {
                    this.selectedImage = clickedImage;
                    
                    // Triple-click detection
                    const now = Date.now();
                    if (this.lastClickedImageId === clickedImage.id) {
                        this.clickTimes.push(now);
                        this.clickTimes = this.clickTimes.filter(t => now - t < 600);
                        
                        if (this.clickTimes.length >= 3) {
                            this.editNote();
                            this.clickTimes = [];
                            return;
                        }
                    } else {
                        this.clickTimes = [now];
                        this.lastClickedImageId = clickedImage.id;
                    }
                    
                    // Allow dragging
                    this.isDragging = true;
                    this.dragOffset = {
                        x: canvasX - clickedImage.x,
                        y: canvasY - clickedImage.y
                    };
                    
                    // Track movement start for tokens
                    if (clickedImage.isToken) {
                        this.movementStart = { x: clickedImage.x, y: clickedImage.y };
                    }
                    
                    this.render();
                    this.updateLayersList();
                    return;
                }

                // Clicked on empty space (or on locked image, which we skip)
                // Deselect current selection
                this.selectedImage = null;
                this.clickTimes = [];
                this.lastClickedImageId = null;
                this.render();
                this.updateLayersList();
            }

            handleMouseMove(e) {
                const rect = this.canvas.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;

                // Convert to canvas coordinates
                const canvasX = (x - this.panX) / this.zoom;
                const canvasY = (y - this.panY) / this.zoom;

                // Handle canvas panning
                if (this.isPanning) {
                    const dx = e.clientX - this.lastPanPoint.x;
                    const dy = e.clientY - this.lastPanPoint.y;
                    
                    this.panX += dx;
                    this.panY += dy;
                    
                    this.lastPanPoint = { x: e.clientX, y: e.clientY };
                    this.render();
                    return;
                }

                // Handle resizing
                if (this.isResizing && this.selectedImage && this.resizeStartState) {
                    this.handleResize(canvasX, canvasY);
                    this.render();
                    return;
                }

                // Update cursor based on hover over resize handles (only for unlocked images)
                if (this.selectedImage && !this.selectedImage.locked && this.currentTool === 'select' && !this.isDrawing && !this.isDragging) {
                    const handle = this.getResizeHandle(canvasX, canvasY, this.selectedImage);
                    if (handle) {
                        this.canvas.className = 'resize-' + handle;
                    } else {
                        this.canvas.className = '';
                    }
                }

                // Handle ruler preview
                if (this.currentTool === 'ruler' && this.rulerPoints.length === 1) {
                    this.render();
                    // Draw ruler preview within transform
                    this.ctx.save();
                    this.ctx.translate(this.panX, this.panY);
                    this.ctx.scale(this.zoom, this.zoom);
                    this.drawRulerPreview(canvasX, canvasY);
                    this.ctx.restore();
                    return;
                }

                // Handle drawing
                if (this.isDrawing && this.currentTool !== 'select') {
                    if (this.currentTool === 'pen' || this.currentTool === 'eraser') {
                        this.currentPath.push({
                            x: canvasX, y: canvasY,
                            tool: this.currentTool,
                            color: this.drawColor,
                            size: this.brushSize,
                            opacity: this.drawOpacity
                        });
                        this.render();
                    } else {
                        // For shapes, render and draw preview within transform
                        this.render();
                        this.ctx.save();
                        this.ctx.translate(this.panX, this.panY);
                        this.ctx.scale(this.zoom, this.zoom);
                        this.drawPreviewShape(canvasX, canvasY);
                        this.ctx.restore();
                    }
                    return;
                }

                if (this.isDragging && this.selectedImage && !this.selectedImage.locked) {
                    this.selectedImage.x = canvasX - this.dragOffset.x;
                    this.selectedImage.y = canvasY - this.dragOffset.y;
                    
                    // Calculate movement distance for tokens
                    if (this.selectedImage.isToken && this.movementStart) {
                        const dx = this.selectedImage.x - this.movementStart.x;
                        const dy = this.selectedImage.y - this.movementStart.y;
                        const distancePx = Math.sqrt(dx * dx + dy * dy);
                        this.movementDistance = distancePx / this.pixelsPerFoot;
                    }
                    
                    this.render();
                    this.saveToStorage();
                }
            }

            handleMouseUp(e) {
                // If long press was triggered, don't do anything else
                if (this.longPressTriggered) {
                    this.longPressTriggered = false;
                    return;
                }

                // Reset panning
                if (this.isPanning) {
                    this.isPanning = false;
                    this.canvas.style.cursor = this.spacePressed ? 'grab' : '';
                }

                // Reset resizing
                if (this.isResizing) {
                    this.isResizing = false;
                    this.resizeHandle = null;
                    this.resizeStartState = null;
                    this.canvas.className = '';
                }

                // Finalize drawing
                if (this.isDrawing && this.currentTool !== 'select' && this.currentTool !== 'pan') {
                    const rect = this.canvas.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;
                    const canvasX = (x - this.panX) / this.zoom;
                    const canvasY = (y - this.panY) / this.zoom;

                    if (this.currentTool === 'pen' || this.currentTool === 'eraser') {
                        if (this.currentPath.length > 0) {
                            this.drawingPaths.push([...this.currentPath]);
                            this.currentPath = [];
                        }
                    } else {
                        // Save shape
                        const shape = {
                            type: this.currentTool,
                            start: this.drawStartPoint,
                            end: { x: canvasX, y: canvasY },
                            color: this.drawColor,
                            size: this.brushSize,
                            opacity: this.drawOpacity
                        };
                        this.drawingPaths.push(shape);
                    }

                    this.saveDrawingState();
                    this.saveToStorage();
                }

                this.isDragging = false;
                this.isRotating = false;
                this.isScaling = false;
                this.isDrawing = false;
                
                // Reset movement tracking
                this.movementStart = null;
                this.movementDistance = 0;
            }

            handleWheel(e) {
                e.preventDefault();

                const rect = this.canvas.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;

                // If no image selected or Alt key held, zoom canvas
                if (!this.selectedImage || e.altKey) {
                    const delta = e.deltaY > 0 ? 0.9 : 1.1;
                    const newZoom = Math.max(0.1, Math.min(5, this.zoom * delta));
                    
                    // Zoom towards mouse position
                    const canvasX = (mouseX - this.panX) / this.zoom;
                    const canvasY = (mouseY - this.panY) / this.zoom;
                    
                    this.zoom = newZoom;
                    
                    this.panX = mouseX - canvasX * this.zoom;
                    this.panY = mouseY - canvasY * this.zoom;
                    
                    this.updateZoomDisplay();
                    this.render();
                    return;
                }

                // Image transformations (only if image selected and not locked)
                if (this.selectedImage.locked) return;

                if (e.ctrlKey) {
                    // Rotate
                    const delta = e.deltaY > 0 ? -5 : 5;
                    this.selectedImage.rotation += delta;
                } else if (e.shiftKey) {
                    // Scale
                    const delta = e.deltaY > 0 ? -0.05 : 0.05;
                    this.selectedImage.scale = Math.max(0.1, this.selectedImage.scale + delta);
                } else {
                    // Default: zoom canvas
                    const delta = e.deltaY > 0 ? 0.9 : 1.1;
                    const newZoom = Math.max(0.1, Math.min(5, this.zoom * delta));
                    
                    const canvasX = (mouseX - this.panX) / this.zoom;
                    const canvasY = (mouseY - this.panY) / this.zoom;
                    
                    this.zoom = newZoom;
                    
                    this.panX = mouseX - canvasX * this.zoom;
                    this.panY = mouseY - canvasY * this.zoom;
                    
                    this.updateZoomDisplay();
                    this.render();
                    return;
                }

                this.render();
                this.saveToStorage();
            }

            handleKeyDown(e) {
                // Don't trigger shortcuts if typing in input/textarea
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                    // Allow ESC to close modals even when in input
                    if (e.key === 'Escape') {
                        this.cancelRename();
                        this.cancelDisplayName();
                        this.cancelHP();
                        this.cancelNote();
                        e.target.blur();
                    }
                    return;
                }

                // Space key for panning
                if (e.code === 'Space' && !this.spacePressed) {
                    e.preventDefault();
                    this.spacePressed = true;
                    this.canvas.style.cursor = 'grab';
                    return;
                }

                if (e.key === 'Delete' && this.selectedImage) {
                    this.deleteSelected();
                } else if (e.ctrlKey && e.key === 'c') {
                    e.preventDefault();
                    // Copy selected image to internal clipboard
                    if (this.selectedImage) {
                        this.copiedImage = this.selectedImage;
                        console.log('Copied:', this.selectedImage.name);
                    }
                } else if (e.ctrlKey && e.key === 'd') {
                    e.preventDefault();
                    if (this.selectedImage) {
                        this.duplicateSelected();
                    }
                } else if (e.ctrlKey && e.key === 'v') {
                    e.preventDefault();
                    // First try to paste from internal clipboard
                    if (this.copiedImage) {
                        this.pasteFromInternal();
                    } else {
                        // Fall back to OS clipboard
                        this.pasteFromClipboard();
                    }
                } else if (e.ctrlKey && e.key === 'z') {
                    e.preventDefault();
                    this.undoDrawing();
                } else if (e.key === 'Escape') {
                    this.hideContextMenu();
                    this.selectedImage = null;
                    this.render();
                } else if (e.key === 'g' || e.key === 'G') {
                    // Deselect
                    this.selectedImage = null;
                    this.render();
                } else if (e.key === 'r' || e.key === 'R') {
                    this.setTool('ruler');
                } else if (e.key === 's' || e.key === 'S') {
                    this.setTool('select');
                } else if (e.key === 'd' || e.key === 'D') {
                    this.setTool('pen');
                } else if (e.key === 'e' || e.key === 'E') {
                    this.setTool('eraser');
                } else if (e.key === '1') {
                    this.setTool('line');
                } else if (e.key === '2') {
                    this.setTool('circle');
                } else if (e.key === '3') {
                    this.setTool('rect');
                }
            }

            handleKeyUp(e) {
                if (e.code === 'Space') {
                    this.spacePressed = false;
                    this.canvas.style.cursor = '';
                }
            }

            // Touch event handlers for mobile
            handleTouchStart(e) {
                e.preventDefault();
                
                if (e.touches.length === 1) {
                    // Single touch - treat as mouse down
                    const touch = e.touches[0];
                    const mouseEvent = new MouseEvent('mousedown', {
                        clientX: touch.clientX,
                        clientY: touch.clientY,
                        button: 0
                    });
                    this.handleMouseDown(mouseEvent);
                } else if (e.touches.length === 2) {
                    // Two finger - pan
                    this.isPanning = true;
                    const touch = e.touches[0];
                    this.lastPanPoint = { x: touch.clientX, y: touch.clientY };
                }
            }

            handleTouchMove(e) {
                e.preventDefault();
                
                if (e.touches.length === 1) {
                    // Single touch - treat as mouse move
                    const touch = e.touches[0];
                    const mouseEvent = new MouseEvent('mousemove', {
                        clientX: touch.clientX,
                        clientY: touch.clientY
                    });
                    this.handleMouseMove(mouseEvent);
                } else if (e.touches.length === 2 && this.isPanning) {
                    // Two finger pan
                    const touch = e.touches[0];
                    const dx = touch.clientX - this.lastPanPoint.x;
                    const dy = touch.clientY - this.lastPanPoint.y;
                    
                    this.panX += dx;
                    this.panY += dy;
                    
                    this.lastPanPoint = { x: touch.clientX, y: touch.clientY };
                    this.render();
                }
            }

            handleTouchEnd(e) {
                e.preventDefault();
                
                if (e.touches.length === 0) {
                    // All fingers lifted
                    const mouseEvent = new MouseEvent('mouseup', {
                        clientX: 0,
                        clientY: 0
                    });
                    this.handleMouseUp(mouseEvent);
                    this.isPanning = false;
                }
            }

            handleContextMenu(e) {
                e.preventDefault();
                
                const rect = this.canvas.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                
                // Convert to canvas coordinates
                const canvasX = (x - this.panX) / this.zoom;
                const canvasY = (y - this.panY) / this.zoom;

                // Check if right-clicking on an image (including locked ones)
                for (let i = this.images.length - 1; i >= 0; i--) {
                    const img = this.images[i];
                    if (this.isPointInImage(canvasX, canvasY, img)) {
                        this.selectedImage = img;
                        this.render();
                        this.updateLayersList();
                        this.showContextMenu(e.clientX, e.clientY);
                        return;
                    }
                }

                // If clicking on empty space, hide menu
                this.hideContextMenu();
            }

            showContextMenu(x, y) {
                // Update lock text based on current state
                const lockText = document.getElementById('lockText');
                if (this.selectedImage) {
                    lockText.textContent = this.selectedImage.locked ? 'Unlock' : 'Lock';
                }

                // Update token text based on current state
                const tokenText = document.getElementById('tokenText');
                if (this.selectedImage) {
                    tokenText.textContent = this.selectedImage.isToken ? 'Unset Token' : 'Set as Token';
                }

                this.contextMenu.style.left = x + 'px';
                this.contextMenu.style.top = y + 'px';
                this.contextMenu.classList.add('active');
            }

            hideContextMenu() {
                this.contextMenu.classList.remove('active');
            }

            toggleToken() {
                if (!this.selectedImage) return;
                
                this.selectedImage.isToken = !this.selectedImage.isToken;
                this.hideContextMenu();
                this.render();
                this.updateLayersList();
                this.saveToStorage();
            }

            // Canvas zoom and pan controls
            zoomIn() {
                const centerX = this.canvas.width / 2;
                const centerY = this.canvas.height / 2;
                
                const canvasX = (centerX - this.panX) / this.zoom;
                const canvasY = (centerY - this.panY) / this.zoom;
                
                this.zoom = Math.min(5, this.zoom * 1.2);
                
                this.panX = centerX - canvasX * this.zoom;
                this.panY = centerY - canvasY * this.zoom;
                
                this.updateZoomDisplay();
                this.render();
            }

            zoomOut() {
                const centerX = this.canvas.width / 2;
                const centerY = this.canvas.height / 2;
                
                const canvasX = (centerX - this.panX) / this.zoom;
                const canvasY = (centerY - this.panY) / this.zoom;
                
                this.zoom = Math.max(0.1, this.zoom * 0.8);
                
                this.panX = centerX - canvasX * this.zoom;
                this.panY = centerY - canvasY * this.zoom;
                
                this.updateZoomDisplay();
                this.render();
            }

            resetView() {
                this.zoom = 1;
                this.panX = 0;
                this.panY = 0;
                this.updateZoomDisplay();
                this.render();
            }

            updateZoomDisplay() {
                const zoomDisplay = document.getElementById('zoomDisplay');
                if (zoomDisplay) {
                    zoomDisplay.textContent = Math.round(this.zoom * 100) + '%';
                }
            }

            // Grid functions
            drawGrid() {
                const startX = Math.floor(-this.panX / this.zoom / this.gridSize) * this.gridSize;
                const startY = Math.floor(-this.panY / this.zoom / this.gridSize) * this.gridSize;
                const endX = startX + (this.canvas.width / this.zoom) + this.gridSize;
                const endY = startY + (this.canvas.height / this.zoom) + this.gridSize;

                this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
                this.ctx.lineWidth = 1 / this.zoom;

                // Vertical lines
                for (let x = startX; x < endX; x += this.gridSize) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(x, startY);
                    this.ctx.lineTo(x, endY);
                    this.ctx.stroke();
                }

                // Horizontal lines
                for (let y = startY; y < endY; y += this.gridSize) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(startX, y);
                    this.ctx.lineTo(endX, y);
                    this.ctx.stroke();
                }
            }

            toggleGrid() {
                this.showGrid = !this.showGrid;
                const btn = document.getElementById('gridToggle');
                if (btn) {
                    btn.style.background = this.showGrid ? '#6b4423' : '#4a4a4a';
                }
                this.render();
            }

            // Drawing undo
            saveDrawingState() {
                this.drawingHistory.push(JSON.parse(JSON.stringify(this.drawingPaths)));
                // Keep only last 20 states
                if (this.drawingHistory.length > 20) {
                    this.drawingHistory.shift();
                }
            }

            undoDrawing() {
                if (this.drawingHistory.length > 0) {
                    this.drawingHistory.pop(); // Remove current state
                    if (this.drawingHistory.length > 0) {
                        this.drawingPaths = JSON.parse(JSON.stringify(this.drawingHistory[this.drawingHistory.length - 1]));
                    } else {
                        this.drawingPaths = [];
                    }
                    this.render();
                    this.saveToStorage();
                }
            }

            // Note functions
            drawNoteIndicator(imgData) {
                const hw = (imgData.width * imgData.scale) / 2;
                const hh = (imgData.height * imgData.scale) / 2;
                
                this.ctx.save();
                this.ctx.fillStyle = 'rgba(255, 215, 0, 0.95)';
                this.ctx.strokeStyle = '#fff';
                this.ctx.lineWidth = 2;
                
                const noteX = imgData.x + hw - 12;
                const noteY = imgData.y - hh + 12;
                
                this.ctx.beginPath();
                this.ctx.arc(noteX, noteY, 12, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.stroke();
                
                this.ctx.fillStyle = '#000';
                this.ctx.font = 'bold 16px Arial';
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                this.ctx.fillText('📖', noteX, noteY);
                
                // Draw note popup on hover (simplified - always show if selected)
                if (this.selectedImage === imgData) {
                    this.drawNotePopup(imgData);
                }
                
                this.ctx.restore();
            }

            drawNotePopup(imgData) {
                if (!imgData.note || !imgData.note.text) return;

                const sizes = {
                    small: { width: 150, fontSize: 10 },
                    medium: { width: 200, fontSize: 12 },
                    large: { width: 300, fontSize: 14 }
                };

                const size = sizes[imgData.note.size || 'medium'];
                const padding = 10;
                const lineHeight = size.fontSize * 1.4;

                this.ctx.save();
                this.ctx.font = `${size.fontSize}px Arial`;
                
                const lines = imgData.note.text.split('\n');
                const maxWidth = size.width - padding * 2;
                const wrappedLines = [];
                
                for (let line of lines) {
                    if (this.ctx.measureText(line).width <= maxWidth) {
                        wrappedLines.push(line);
                    } else {
                        const words = line.split(' ');
                        let currentLine = '';
                        for (let word of words) {
                            const testLine = currentLine + (currentLine ? ' ' : '') + word;
                            if (this.ctx.measureText(testLine).width <= maxWidth) {
                                currentLine = testLine;
                            } else {
                                if (currentLine) wrappedLines.push(currentLine);
                                currentLine = word;
                            }
                        }
                        if (currentLine) wrappedLines.push(currentLine);
                    }
                }

                const height = wrappedLines.length * lineHeight + padding * 2;
                const hw = (imgData.width * imgData.scale) / 2;
                const hh = (imgData.height * imgData.scale) / 2;
                const x = imgData.x + hw + 20;
                const y = imgData.y - hh;

                // Background
                this.ctx.fillStyle = 'rgba(50, 50, 50, 0.95)';
                this.ctx.strokeStyle = '#ffd700';
                this.ctx.lineWidth = 2;
                this.ctx.fillRect(x, y, size.width, height);
                this.ctx.strokeRect(x, y, size.width, height);

                // Text
                this.ctx.fillStyle = '#fff';
                this.ctx.textAlign = 'left';
                this.ctx.textBaseline = 'top';
                
                for (let i = 0; i < wrappedLines.length; i++) {
                    this.ctx.fillText(wrappedLines[i], x + padding, y + padding + i * lineHeight);
                }

                this.ctx.restore();
            }

            editNote() {
                if (!this.selectedImage) return;

                const modal = document.getElementById('noteModal');
                const textarea = document.getElementById('noteTextarea');
                
                // Load existing note if any
                if (this.selectedImage.note) {
                    textarea.value = this.selectedImage.note.text || '';
                    this.currentNoteSize = this.selectedImage.note.size || 'medium';
                } else {
                    textarea.value = '';
                    this.currentNoteSize = 'medium';
                }

                // Update size button states
                this.updateNoteSizeButtons();

                modal.classList.add('active');
                textarea.focus();
                this.hideContextMenu();
            }

            setNoteSize(size) {
                this.currentNoteSize = size;
                this.updateNoteSizeButtons();
            }

            updateNoteSizeButtons() {
                const buttons = document.querySelectorAll('.size-btn');
                buttons.forEach(btn => {
                    btn.classList.remove('active');
                    const text = btn.textContent.toLowerCase();
                    if ((text === 'เล็ก' && this.currentNoteSize === 'small') ||
                        (text === 'กลาง' && this.currentNoteSize === 'medium') ||
                        (text === 'ใหญ่' && this.currentNoteSize === 'large')) {
                        btn.classList.add('active');
                    }
                });
            }

            confirmNote() {
                if (!this.selectedImage) return;

                const textarea = document.getElementById('noteTextarea');
                const text = textarea.value.trim();

                if (text) {
                    this.selectedImage.note = {
                        text: text,
                        size: this.currentNoteSize
                    };
                } else {
                    delete this.selectedImage.note;
                }

                this.cancelNote();
                this.render();
                this.saveToStorage();
            }

            cancelNote() {
                const modal = document.getElementById('noteModal');
                modal.classList.remove('active');
            }

            // Display Name functions
            setDisplayName() {
                if (!this.selectedImage) return;

                const modal = document.getElementById('displayNameModal');
                const input = document.getElementById('displayNameInput');
                
                input.value = this.selectedImage.displayName || '';
                modal.classList.add('active');
                input.focus();
                this.hideContextMenu();
            }

            confirmDisplayName() {
                if (!this.selectedImage) return;

                const input = document.getElementById('displayNameInput');
                this.selectedImage.displayName = input.value.trim();
                
                this.cancelDisplayName();
                this.render();
                this.saveToStorage();
            }

            cancelDisplayName() {
                const modal = document.getElementById('displayNameModal');
                modal.classList.remove('active');
            }

            // HP functions
            setHP() {
                if (!this.selectedImage) return;

                const modal = document.getElementById('hpModal');
                const currentInput = document.getElementById('currentHPInput');
                const maxInput = document.getElementById('maxHPInput');
                
                // Initialize hp if not exists
                if (!this.selectedImage.hp) {
                    this.selectedImage.hp = { current: 0, max: 0 };
                }
                
                currentInput.value = this.selectedImage.hp.current || 0;
                maxInput.value = this.selectedImage.hp.max || 0;
                
                modal.classList.add('active');
                currentInput.focus();
                this.hideContextMenu();
            }

            confirmHP() {
                if (!this.selectedImage) return;

                const currentInput = document.getElementById('currentHPInput');
                const maxInput = document.getElementById('maxHPInput');
                
                const current = parseInt(currentInput.value) || 0;
                const max = parseInt(maxInput.value) || 0;
                
                this.selectedImage.hp = {
                    current: Math.max(0, current),
                    max: Math.max(0, max)
                };
                
                this.cancelHP();
                this.render();
                this.saveToStorage();
            }

            cancelHP() {
                const modal = document.getElementById('hpModal');
                modal.classList.remove('active');
            }

            // Dice Roll functions
            showRollDialog() {
                if (!this.selectedImage) return;
                const modal = document.getElementById('rollModal');
                const input = document.getElementById('rollFormulaInput');
                input.value = '1d20+0';
                modal.classList.add('active');
                input.focus();
                input.select();
                this.hideContextMenu();
            }

            confirmRoll() {
                if (!this.selectedImage) return;
                const input = document.getElementById('rollFormulaInput');
                const formula = input.value.trim();
                const match = formula.match(/^(\d+)d(\d+)([+-]\d+)?$/i);
                if (!match) {
                    alert('Invalid format! Use: 1d20+2 or 2d6-1');
                    return;
                }
                const count = parseInt(match[1]);
                const sides = parseInt(match[2]);
                const modifier = match[3] ? parseInt(match[3]) : 0;
                let total = 0;
                let rolls = [];
                for (let i = 0; i < count; i++) {
                    const roll = Math.floor(Math.random() * sides) + 1;
                    rolls.push(roll);
                    total += roll;
                }
                total += modifier;
                this.addFloatingNumber(this.selectedImage, total, rolls, modifier);
                this.cancelRoll();
            }

            cancelRoll() {
                document.getElementById('rollModal').classList.remove('active');
            }

            addFloatingNumber(image, total, rolls, modifier) {
                this.floatingNumbers.push({
                    x: image.x,
                    y: image.y - (image.height * image.scale) / 2 - 50,
                    total: total,
                    rolls: rolls,
                    modifier: modifier,
                    opacity: 1,
                    lifetime: 0,
                    maxLifetime: 3000
                });
                this.animateFloatingNumbers();
            }

            animateFloatingNumbers() {
                const animate = () => {
                    let hasActive = false;
                    for (let i = this.floatingNumbers.length - 1; i >= 0; i--) {
                        const num = this.floatingNumbers[i];
                        num.lifetime += 16;
                        if (num.lifetime >= num.maxLifetime) {
                            this.floatingNumbers.splice(i, 1);
                        } else {
                            hasActive = true;
                            num.opacity = 1 - (num.lifetime / num.maxLifetime);
                            num.y -= 0.5;
                        }
                    }
                    this.render();
                    if (hasActive) requestAnimationFrame(animate);
                };
                animate();
            }

            // Resize handle detection and handling
            getResizeHandle(canvasX, canvasY, imgData) {
                const hw = (imgData.width * imgData.scale) / 2;
                const hh = (imgData.height * imgData.scale) / 2;
                const handleSize = 12; // Larger detection area for easier clicking

                const handles = [
                    { x: imgData.x - hw - 5, y: imgData.y - hh - 5, type: 'nw' },
                    { x: imgData.x + hw + 5, y: imgData.y - hh - 5, type: 'ne' },
                    { x: imgData.x - hw - 5, y: imgData.y + hh + 5, type: 'sw' },
                    { x: imgData.x + hw + 5, y: imgData.y + hh + 5, type: 'se' },
                    { x: imgData.x, y: imgData.y - hh - 5, type: 'n' },
                    { x: imgData.x, y: imgData.y + hh + 5, type: 's' },
                    { x: imgData.x - hw - 5, y: imgData.y, type: 'w' },
                    { x: imgData.x + hw + 5, y: imgData.y, type: 'e' }
                ];

                for (let handle of handles) {
                    const dx = canvasX - handle.x;
                    const dy = canvasY - handle.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    
                    if (distance < handleSize) {
                        return handle.type;
                    }
                }

                return null;
            }

            handleResize(canvasX, canvasY) {
                if (!this.selectedImage || !this.resizeStartState) return;

                const img = this.selectedImage;
                const dx = canvasX - this.resizeStartState.mouseX;
                const dy = canvasY - this.resizeStartState.mouseY;

                // Calculate new scale based on handle type
                const handle = this.resizeHandle;
                
                if (handle === 'se' || handle === 'nw' || handle === 'ne' || handle === 'sw') {
                    // Corner resize - proportional
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    const direction = (handle === 'se' || handle === 'ne') ? 1 : -1;
                    const scaleFactor = 1 + (distance * direction * 0.003);
                    img.scale = Math.max(0.1, this.resizeStartState.scale * scaleFactor);
                } else if (handle === 'e' || handle === 'w') {
                    // Horizontal resize
                    const direction = handle === 'e' ? 1 : -1;
                    const scaleFactor = 1 + (dx * direction * 0.003);
                    img.scale = Math.max(0.1, this.resizeStartState.scale * scaleFactor);
                } else if (handle === 'n' || handle === 's') {
                    // Vertical resize
                    const direction = handle === 's' ? 1 : -1;
                    const scaleFactor = 1 + (dy * direction * 0.003);
                    img.scale = Math.max(0.1, this.resizeStartState.scale * scaleFactor);
                }

                this.saveToStorage();
            }

            filterAssets(searchTerm) {
                const assetsList = document.getElementById('assetsList');
                assetsList.innerHTML = '';

                const filtered = this.images.filter(img => 
                    img.name.toLowerCase().includes(searchTerm.toLowerCase())
                );

                if (filtered.length === 0) {
                    assetsList.innerHTML = '<p style="color: #666; text-align: center; padding: 20px;">ไม่พบ Assets</p>';
                    return;
                }

                for (let imgData of filtered) {
                    const item = document.createElement('div');
                    item.className = 'asset-item';
                    item.innerHTML = `
                        <img src="${imgData.imgSrc}" class="asset-thumbnail">
                        <div class="asset-info">
                            <div class="asset-name">${imgData.name} ${imgData.locked ? '🔒' : ''}</div>
                            <div class="asset-size">${Math.round(imgData.width * imgData.scale)}x${Math.round(imgData.height * imgData.scale)}px</div>
                        </div>
                        <div class="asset-actions">
                            <button class="asset-btn" onclick="vtt.selectAsset(${imgData.id})">เลือก</button>
                            <button class="asset-btn" onclick="vtt.deleteAsset(${imgData.id})">ลบ</button>
                        </div>
                    `;
                    assetsList.appendChild(item);
                }
            }

            // Sidebar toggles
            toggleLeftSidebar() {
                const sidebar = document.getElementById('leftSidebar');
                const toggle = document.getElementById('leftToggle');
                const canvas = document.getElementById('canvasContainer');
                
                this.leftSidebarVisible = !this.leftSidebarVisible;
                sidebar.classList.toggle('hidden');
                canvas.classList.toggle('left-collapsed');
                toggle.classList.toggle('shifted');
                toggle.textContent = this.leftSidebarVisible ? '◀' : '▶';
                
                setTimeout(() => {
                    this.initCanvas();
                    this.render();
                }, 300); // Wait for transition
            }

            toggleRightSidebar() {
                const sidebar = document.getElementById('rightSidebar');
                const toggle = document.getElementById('rightToggle');
                const canvas = document.getElementById('canvasContainer');
                
                this.rightSidebarVisible = !this.rightSidebarVisible;
                sidebar.classList.toggle('hidden');
                canvas.classList.toggle('right-collapsed');
                toggle.classList.toggle('shifted');
                toggle.textContent = this.rightSidebarVisible ? '▶' : '◀';
                
                setTimeout(() => {
                    this.initCanvas();
                    this.render();
                }, 300); // Wait for transition
            }

            handlePaste(e) {
                const items = e.clipboardData.items;
                
                for (let item of items) {
                    if (item.type.indexOf('image') !== -1) {
                        const blob = item.getAsFile();
                        this.loadImageFromBlob(blob);
                        break;
                    }
                }
            }

            loadImageFromBlob(blob) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const img = new Image();
                    img.onload = () => {
                        this.promptForName((name) => {
                            this.addImage(img, name);
                        });
                    };
                    img.src = e.target.result;
                };
                reader.readAsDataURL(blob);
            }

            addImage(imgElement, name) {
                // Calculate viewport center in canvas coordinates
                const viewportCenterX = (this.canvas.width / 2 - this.panX) / this.zoom;
                const viewportCenterY = (this.canvas.height / 2 - this.panY) / this.zoom;
                
                const imageData = {
                    id: Date.now(),
                    name: name || 'รูปภาพ ' + (this.images.length + 1),
                    displayName: '',
                    hp: { current: 0, max: 0 },
                    isToken: false,
                    x: viewportCenterX,
                    y: viewportCenterY,
                    width: imgElement.width,
                    height: imgElement.height,
                    scale: Math.min(200 / imgElement.width, 200 / imgElement.height, 1),
                    rotation: 0,
                    imgSrc: imgElement.src
                };

                this.images.push(imageData);
                this.selectedImage = imageData;
                this.render();
                this.updateAssetsList();
                this.saveToStorage();
            }

            isPointInImage(x, y, img) {
                const hw = (img.width * img.scale) / 2;
                const hh = (img.height * img.scale) / 2;

                // Simple bounding box check (could be improved for rotation)
                return x >= img.x - hw && x <= img.x + hw &&
                       y >= img.y - hh && y <= img.y + hh;
            }

            render() {
                this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

                // Apply pan and zoom transformations
                this.ctx.save();
                this.ctx.translate(this.panX, this.panY);
                this.ctx.scale(this.zoom, this.zoom);

                // Draw all images
                for (let imgData of this.images) {
                    this.drawImage(imgData);
                    
                    // Draw note indicator if note exists
                    if (imgData.note && imgData.note.text) {
                        this.drawNoteIndicator(imgData);
                    }
                }

                // Draw selection box for selected image
                if (this.selectedImage) {
                    this.drawSelectionBox(this.selectedImage);
                }

                // Draw all saved drawings
                this.renderDrawings();

                // Draw current path while drawing
                if (this.isDrawing && this.currentPath.length > 0) {
                    this.renderPath(this.currentPath);
                }

                // Draw ruler points
                if (this.currentTool === 'ruler' && this.rulerPoints.length > 0) {
                    for (let point of this.rulerPoints) {
                        this.ctx.fillStyle = this.drawColor;
                        this.ctx.beginPath();
                        this.ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
                        this.ctx.fill();
                        
                        this.ctx.strokeStyle = '#fff';
                        this.ctx.lineWidth = 2;
                        this.ctx.beginPath();
                        this.ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
                        this.ctx.stroke();
                    }
                }

                // Draw floating numbers (dice rolls)
                for (let num of this.floatingNumbers) {
                    this.ctx.save();
                    this.ctx.globalAlpha = num.opacity;
                    this.ctx.font = 'bold 32px Arial';
                    this.ctx.fillStyle = '#ffd700';
                    this.ctx.strokeStyle = '#000';
                    this.ctx.lineWidth = 3;
                    const text = `${num.total}`;
                    const textWidth = this.ctx.measureText(text).width;
                    this.ctx.strokeText(text, num.x - textWidth / 2, num.y);
                    this.ctx.fillText(text, num.x - textWidth / 2, num.y);
                    
                    // Show rolls detail
                    const detail = `[${num.rolls.join('+')}]${num.modifier >= 0 ? '+' : ''}${num.modifier}`;
                    this.ctx.font = '14px Arial';
                    const detailWidth = this.ctx.measureText(detail).width;
                    this.ctx.fillStyle = '#fff';
                    this.ctx.fillText(detail, num.x - detailWidth / 2, num.y + 20);
                    this.ctx.restore();
                }

                // Draw grid on TOP LAYER (always visible)
                if (this.showGrid) {
                    this.drawGrid();
                }

                // Restore transform
                this.ctx.restore();
            }

            drawImage(imgData) {
                const img = new Image();
                img.src = imgData.imgSrc;

                this.ctx.save();
                this.ctx.translate(imgData.x, imgData.y);
                this.ctx.rotate(imgData.rotation * Math.PI / 180);
                this.ctx.scale(imgData.scale, imgData.scale);
                this.ctx.drawImage(img, -imgData.width / 2, -imgData.height / 2, imgData.width, imgData.height);
                
                this.ctx.restore();
                this.ctx.save();
                
                // Draw name label (top)
                this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                this.ctx.font = '12px Arial';
                const labelText = imgData.name + (imgData.locked ? ' 🔒' : '') + (imgData.isToken ? ' 🎭' : '');
                const textWidth = this.ctx.measureText(labelText).width;
                const labelX = imgData.x - textWidth / 2 - 4;
                const labelY = imgData.y - (imgData.height * imgData.scale) / 2 - 20;
                this.ctx.fillRect(labelX, labelY, textWidth + 8, 18);
                this.ctx.fillStyle = imgData.locked ? '#ffd700' : '#fff';
                this.ctx.fillText(labelText, imgData.x - textWidth / 2, labelY + 13);
                
                // Draw display name and HP (bottom)
                let yOffset = (imgData.height * imgData.scale) / 2 + 5;
                
                // Display name
                if (imgData.displayName && imgData.displayName.trim()) {
                    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
                    this.ctx.font = 'bold 14px Arial';
                    const displayWidth = this.ctx.measureText(imgData.displayName).width;
                    const displayX = imgData.x - displayWidth / 2 - 4;
                    const displayY = imgData.y + yOffset;
                    this.ctx.fillRect(displayX, displayY, displayWidth + 8, 20);
                    this.ctx.fillStyle = '#fff';
                    this.ctx.fillText(imgData.displayName, imgData.x - displayWidth / 2, displayY + 15);
                    yOffset += 25;
                }
                
                // HP counter (only if not 0/0)
                if (imgData.hp && (imgData.hp.current !== 0 || imgData.hp.max !== 0)) {
                    const hpText = `${imgData.hp.current}/${imgData.hp.max}`;
                    this.ctx.font = '12px Arial';
                    const hpWidth = this.ctx.measureText(hpText).width;
                    const hpX = imgData.x - hpWidth / 2 - 4;
                    const hpY = imgData.y + yOffset;
                    
                    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
                    this.ctx.fillRect(hpX, hpY, hpWidth + 8, 18);
                    
                    // Color based on HP percentage
                    const hpPercent = imgData.hp.max > 0 ? imgData.hp.current / imgData.hp.max : 0;
                    if (hpPercent > 0.5) {
                        this.ctx.fillStyle = '#0f0'; // Green
                    } else if (hpPercent > 0.25) {
                        this.ctx.fillStyle = '#ff0'; // Yellow
                    } else {
                        this.ctx.fillStyle = '#f00'; // Red
                    }
                    
                    this.ctx.fillText(hpText, imgData.x - hpWidth / 2, hpY + 13);
                }
                
                this.ctx.restore();
            }

            drawSelectionBox(imgData) {
                const hw = (imgData.width * imgData.scale) / 2;
                const hh = (imgData.height * imgData.scale) / 2;

                // Draw movement line for tokens
                if (imgData.isToken && this.isDragging && this.movementStart && this.movementDistance > 0) {
                    this.ctx.save();
                    this.ctx.strokeStyle = '#ff0000';
                    this.ctx.lineWidth = 3;
                    this.ctx.setLineDash([10, 5]);
                    
                    // Draw line from start to current position
                    this.ctx.beginPath();
                    this.ctx.moveTo(this.movementStart.x, this.movementStart.y);
                    this.ctx.lineTo(imgData.x, imgData.y);
                    this.ctx.stroke();
                    
                    // Draw start point marker
                    this.ctx.setLineDash([]);
                    this.ctx.fillStyle = '#ff0000';
                    this.ctx.beginPath();
                    this.ctx.arc(this.movementStart.x, this.movementStart.y, 6, 0, Math.PI * 2);
                    this.ctx.fill();
                    this.ctx.strokeStyle = '#fff';
                    this.ctx.lineWidth = 2;
                    this.ctx.stroke();
                    
                    this.ctx.restore();
                }

                this.ctx.save();
                this.ctx.strokeStyle = '#ffd700';
                this.ctx.lineWidth = 2;
                this.ctx.strokeRect(imgData.x - hw - 5, imgData.y - hh - 5, 
                                   hw * 2 + 10, hh * 2 + 10);
                
                // Draw resize handles (8 handles: 4 corners + 4 edges)
                const handleSize = 8;
                const handles = [
                    // Corners
                    { x: imgData.x - hw - 5, y: imgData.y - hh - 5, type: 'nw' },
                    { x: imgData.x + hw + 5, y: imgData.y - hh - 5, type: 'ne' },
                    { x: imgData.x - hw - 5, y: imgData.y + hh + 5, type: 'sw' },
                    { x: imgData.x + hw + 5, y: imgData.y + hh + 5, type: 'se' },
                    // Edges
                    { x: imgData.x, y: imgData.y - hh - 5, type: 'n' },
                    { x: imgData.x, y: imgData.y + hh + 5, type: 's' },
                    { x: imgData.x - hw - 5, y: imgData.y, type: 'w' },
                    { x: imgData.x + hw + 5, y: imgData.y, type: 'e' }
                ];

                this.ctx.fillStyle = '#ffd700';
                for (let handle of handles) {
                    this.ctx.fillRect(handle.x - handleSize/2, handle.y - handleSize/2, handleSize, handleSize);
                }

                this.ctx.restore();

                // Show movement distance for tokens
                if (imgData.isToken && this.isDragging && this.movementDistance > 0) {
                    this.ctx.save();
                    this.ctx.fillStyle = 'rgba(255, 215, 0, 0.95)';
                    this.ctx.font = 'bold 16px Arial';
                    const distText = `${this.movementDistance.toFixed(1)} ft`;
                    const distWidth = this.ctx.measureText(distText).width;
                    this.ctx.fillRect(imgData.x - distWidth / 2 - 6, imgData.y - hh - 45, distWidth + 12, 24);
                    this.ctx.fillStyle = '#000';
                    this.ctx.fillText(distText, imgData.x - distWidth / 2, imgData.y - hh - 25);
                    this.ctx.restore();
                }

                // Show controls hint
                this.ctx.save();
                this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
                this.ctx.font = '11px Arial';
                
                const hint = imgData.locked 
                    ? `🔒 Locked | Drag handles to resize | Right-click: menu`
                    : `Drag handles to resize | Right-click: menu | Ctrl+Wheel: หมุน`;
                
                const hintWidth = this.ctx.measureText(hint).width;
                this.ctx.fillRect(imgData.x - hintWidth / 2 - 4, imgData.y + hh + 15, hintWidth + 8, 16);
                this.ctx.fillStyle = imgData.locked ? '#ffd700' : '#fff';
                this.ctx.fillText(hint, imgData.x - hintWidth / 2, imgData.y + hh + 27);
                this.ctx.restore();
            }

            updateAssetsList() {
                const assetsList = document.getElementById('assetsList');
                assetsList.innerHTML = '';

                if (this.images.length === 0) {
                    assetsList.innerHTML = '<p style="color: #666; text-align: center; padding: 20px;">ยังไม่มี Assets</p>';
                    return;
                }

                for (let imgData of this.images) {
                    const item = document.createElement('div');
                    item.className = 'asset-item';
                    item.innerHTML = `
                        <img src="${imgData.imgSrc}" class="asset-thumbnail">
                        <div class="asset-info">
                            <div class="asset-name">${imgData.name} ${imgData.locked ? '🔒' : ''}</div>
                            <div class="asset-size">${Math.round(imgData.width * imgData.scale)}x${Math.round(imgData.height * imgData.scale)}px</div>
                        </div>
                        <div class="asset-actions">
                            <button class="asset-btn" onclick="vtt.selectAsset(${imgData.id})">เลือก</button>
                            <button class="asset-btn" onclick="vtt.deleteAsset(${imgData.id})">ลบ</button>
                        </div>
                    `;
                    assetsList.appendChild(item);
                }
                
                this.updateLayersList();
            }

            selectAsset(id) {
                this.selectedImage = this.images.find(img => img.id === id);
                this.render();
                this.updateLayersList();
            }

            deleteAsset(id) {
                this.images = this.images.filter(img => img.id !== id);
                if (this.selectedImage && this.selectedImage.id === id) {
                    this.selectedImage = null;
                }
                this.render();
                this.updateAssetsList();
                this.saveToStorage();
            }

            promptForName(callback, defaultName = '') {
                this.currentNameCallback = callback;
                const modal = document.getElementById('renameModal');
                const input = document.getElementById('imageNameInput');
                input.value = defaultName;
                modal.classList.add('active');
                input.focus();
                input.select(); // Select all text for easy editing
            }

            confirmRename() {
                const input = document.getElementById('imageNameInput');
                const name = input.value.trim() || 'รูปภาพ';
                
                if (this.currentNameCallback) {
                    this.currentNameCallback(name);
                    this.currentNameCallback = null;
                } else if (this.selectedImage) {
                    this.selectedImage.name = name;
                    this.render();
                    this.updateAssetsList();
                    this.updateLayersList();
                    this.saveToStorage();
                }

                this.cancelRename();
            }

            cancelRename() {
                const modal = document.getElementById('renameModal');
                modal.classList.remove('active');
                this.currentNameCallback = null;
            }

            pasteFromClipboard() {
                navigator.clipboard.read().then(clipboardItems => {
                    for (let item of clipboardItems) {
                        for (let type of item.types) {
                            if (type.startsWith('image/')) {
                                item.getType(type).then(blob => {
                                    this.loadImageFromBlob(blob);
                                });
                                return;
                            }
                        }
                    }
                    alert('ไม่พบรูปภาพใน clipboard\nกรุณา Copy รูปภาพก่อน (Ctrl+C)');
                }).catch(err => {
                    alert('ไม่สามารถอ่าน clipboard ได้\nกรุณา Copy รูปภาพแล้วกด Ctrl+V');
                });
            }

            deleteSelected() {
                if (this.selectedImage) {
                    this.deleteAsset(this.selectedImage.id);
                    this.hideContextMenu();
                }
            }

            renameSelected() {
                if (this.selectedImage) {
                    this.promptForName((name) => {
                        this.selectedImage.name = name;
                        this.render();
                        this.updateAssetsList();
                        this.saveToStorage();
                    });
                    this.hideContextMenu();
                }
            }

            duplicateSelected() {
                if (!this.selectedImage) return;
                
                this.hideContextMenu();
                
                // Prompt for new name
                this.promptForName((name) => {
                    // Create a deep copy of the image
                    const duplicate = {
                        id: Date.now(),
                        name: name,
                        displayName: this.selectedImage.displayName || '',
                        hp: this.selectedImage.hp ? { 
                            current: this.selectedImage.hp.current, 
                            max: this.selectedImage.hp.max 
                        } : { current: 0, max: 0 },
                        isToken: this.selectedImage.isToken || false,
                        x: this.selectedImage.x + 30, // Offset position
                        y: this.selectedImage.y + 30,
                        width: this.selectedImage.width,
                        height: this.selectedImage.height,
                        scale: this.selectedImage.scale,
                        rotation: this.selectedImage.rotation,
                        imgSrc: this.selectedImage.imgSrc,
                        locked: false, // Duplicate is always unlocked
                        note: this.selectedImage.note ? {
                            text: this.selectedImage.note.text,
                            size: this.selectedImage.note.size
                        } : null
                    };
                    
                    this.images.push(duplicate);
                    this.selectedImage = duplicate;
                    this.render();
                    this.updateAssetsList();
                    this.updateLayersList();
                    this.saveToStorage();
                }, `${this.selectedImage.name} (Copy)`); // Default name
            }

            pasteFromInternal() {
                if (!this.copiedImage) return;
                
                // Prompt for new name
                this.promptForName((name) => {
                    // Create a deep copy from copiedImage
                    const duplicate = {
                        id: Date.now(),
                        name: name,
                        displayName: this.copiedImage.displayName || '',
                        hp: this.copiedImage.hp ? { 
                            current: this.copiedImage.hp.current, 
                            max: this.copiedImage.hp.max 
                        } : { current: 0, max: 0 },
                        isToken: this.copiedImage.isToken || false,
                        x: this.copiedImage.x + 30, // Offset position
                        y: this.copiedImage.y + 30,
                        width: this.copiedImage.width,
                        height: this.copiedImage.height,
                        scale: this.copiedImage.scale,
                        rotation: this.copiedImage.rotation,
                        imgSrc: this.copiedImage.imgSrc,
                        locked: false,
                        note: this.copiedImage.note ? {
                            text: this.copiedImage.note.text,
                            size: this.copiedImage.note.size
                        } : null
                    };
                    
                    this.images.push(duplicate);
                    this.selectedImage = duplicate;
                    this.render();
                    this.updateAssetsList();
                    this.updateLayersList();
                    this.saveToStorage();
                }, `${this.copiedImage.name} (Copy)`);
            }

            bringToFront() {
                if (this.selectedImage) {
                    const index = this.images.indexOf(this.selectedImage);
                    if (index > -1) {
                        this.images.splice(index, 1);
                        this.images.push(this.selectedImage);
                        this.render();
                        this.saveToStorage();
                    }
                    this.hideContextMenu();
                }
            }

            sendToBack() {
                if (this.selectedImage) {
                    const index = this.images.indexOf(this.selectedImage);
                    if (index > -1) {
                        this.images.splice(index, 1);
                        this.images.unshift(this.selectedImage);
                        this.render();
                        this.saveToStorage();
                    }
                    this.hideContextMenu();
                }
            }

            clearCanvas() {
                if (confirm('คุณต้องการลบทุกอย่างบน Canvas หรือไม่?')) {
                    this.images = [];
                    this.selectedImage = null;
                    this.render();
                    this.updateAssetsList();
                    this.updateLayersList();
                    this.saveToStorage();
                }
            }

            saveToStorage() {
                const data = {
                    images: this.images,
                    drawings: this.drawingPaths
                };
                localStorage.setItem('vtt-data', JSON.stringify(data));
            }

            loadFromStorage() {
                const saved = localStorage.getItem('vtt-data');
                if (saved) {
                    const data = JSON.parse(saved);
                    this.images = data.images || [];
                    this.drawingPaths = data.drawings || [];
                    this.updateAssetsList();
                    this.updateLayersList();
                }
            }

            saveProject() {
                const data = {
                    images: this.images,
                    drawings: this.drawingPaths
                };
                const json = JSON.stringify(data, null, 2);
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'dnd-vtt-project-' + new Date().getTime() + '.json';
                a.click();
                URL.revokeObjectURL(url);
            }

            loadProject() {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.json';
                input.onchange = (e) => {
                    const file = e.target.files[0];
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        try {
                            const data = JSON.parse(event.target.result);
                            this.images = data.images || data || []; // Support old format
                            this.drawingPaths = data.drawings || [];
                            this.selectedImage = null;
                            this.render();
                            this.updateAssetsList();
                            this.updateLayersList();
                            this.saveToStorage();
                        } catch (err) {
                            alert('ไม่สามารถโหลดไฟล์ได้');
                        }
                    };
                    reader.readAsText(file);
                };
                input.click();
            }

            // Drawing tool methods
            setTool(tool) {
                this.currentTool = tool;
                
                // Update UI - both old and new toolbar
                document.querySelectorAll('.tool-btn, .tool-btn-bottom').forEach(btn => {
                    btn.classList.remove('active');
                });
                
                // Try to find button in both toolbars
                const toolBtn = document.getElementById('tool-' + tool);
                if (toolBtn) toolBtn.classList.add('active');
                
                // Change cursor based on tool
                if (tool === 'select') {
                    this.canvas.style.cursor = 'default';
                } else if (tool === 'pan') {
                    this.canvas.style.cursor = 'grab';
                } else {
                    this.canvas.style.cursor = 'crosshair';
                }
            }

            renderDrawings() {
                for (let item of this.drawingPaths) {
                    if (Array.isArray(item)) {
                        // It's a path (pen/eraser)
                        this.renderPath(item);
                    } else {
                        // It's a shape
                        this.renderShape(item);
                    }
                }
            }

            renderPath(path) {
                if (path.length === 0) return;

                const first = path[0];
                this.ctx.strokeStyle = first.tool === 'eraser' ? '#2a2a2a' : first.color;
                this.ctx.lineWidth = first.size;
                this.ctx.lineCap = 'round';
                this.ctx.lineJoin = 'round';
                this.ctx.globalAlpha = first.tool === 'eraser' ? 1 : first.opacity;

                this.ctx.beginPath();
                this.ctx.moveTo(path[0].x, path[0].y);
                
                for (let i = 1; i < path.length; i++) {
                    this.ctx.lineTo(path[i].x, path[i].y);
                }
                
                this.ctx.stroke();
                this.ctx.globalAlpha = 1;
            }

            renderShape(shape) {
                this.ctx.strokeStyle = shape.color;
                this.ctx.lineWidth = shape.size;
                this.ctx.globalAlpha = shape.opacity;

                this.ctx.beginPath();
                
                if (shape.type === 'line') {
                    this.ctx.moveTo(shape.start.x, shape.start.y);
                    this.ctx.lineTo(shape.end.x, shape.end.y);
                    this.ctx.stroke();
                } else if (shape.type === 'ruler') {
                    // Draw ruler line
                    this.ctx.moveTo(shape.start.x, shape.start.y);
                    this.ctx.lineTo(shape.end.x, shape.end.y);
                    this.ctx.stroke();
                    
                    // Draw measurement text
                    this.ctx.globalAlpha = 1;
                    const midX = (shape.start.x + shape.end.x) / 2;
                    const midY = (shape.start.y + shape.end.y) / 2;
                    
                    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
                    this.ctx.font = 'bold 14px Arial';
                    const text = shape.distanceFt + 'ft (' + shape.distancePx + 'px)';
                    const textWidth = this.ctx.measureText(text).width;
                    this.ctx.fillRect(midX - textWidth / 2 - 5, midY - 12, textWidth + 10, 20);
                    this.ctx.fillStyle = '#ffd700';
                    this.ctx.fillText(text, midX - textWidth / 2, midY + 3);
                } else if (shape.type === 'rect') {
                    const width = shape.end.x - shape.start.x;
                    const height = shape.end.y - shape.start.y;
                    this.ctx.strokeRect(shape.start.x, shape.start.y, width, height);
                } else if (shape.type === 'circle') {
                    const dx = shape.end.x - shape.start.x;
                    const dy = shape.end.y - shape.start.y;
                    const radius = Math.sqrt(dx * dx + dy * dy);
                    this.ctx.arc(shape.start.x, shape.start.y, radius, 0, Math.PI * 2);
                    this.ctx.stroke();
                }

                this.ctx.globalAlpha = 1;
            }

            drawPreviewShape(canvasX, canvasY) {
                if (!this.drawStartPoint) return;

                this.ctx.strokeStyle = this.drawColor;
                this.ctx.lineWidth = this.brushSize;
                this.ctx.globalAlpha = this.drawOpacity;
                this.ctx.setLineDash([5, 5]);

                this.ctx.beginPath();

                if (this.currentTool === 'line') {
                    this.ctx.moveTo(this.drawStartPoint.x, this.drawStartPoint.y);
                    this.ctx.lineTo(canvasX, canvasY);
                    this.ctx.stroke();
                } else if (this.currentTool === 'rect') {
                    const width = canvasX - this.drawStartPoint.x;
                    const height = canvasY - this.drawStartPoint.y;
                    this.ctx.strokeRect(this.drawStartPoint.x, this.drawStartPoint.y, width, height);
                } else if (this.currentTool === 'circle') {
                    const dx = canvasX - this.drawStartPoint.x;
                    const dy = canvasY - this.drawStartPoint.y;
                    const radius = Math.sqrt(dx * dx + dy * dy);
                    this.ctx.arc(this.drawStartPoint.x, this.drawStartPoint.y, radius, 0, Math.PI * 2);
                    this.ctx.stroke();
                }

                this.ctx.setLineDash([]);
                this.ctx.globalAlpha = 1;
            }

            updateBrushSize(value) {
                this.brushSize = parseInt(value);
                document.getElementById('brushSizeValue').textContent = value;
            }

            updateOpacity(value) {
                this.drawOpacity = parseInt(value) / 100;
                document.getElementById('opacityValue').textContent = value + '%';
            }

            clearDrawing() {
                this.drawingPaths = [];
                this.render();
                this.saveToStorage();
            }

            // Layer management
            updateLayersList() {
                const layersList = document.getElementById('layersList');
                layersList.innerHTML = '';

                if (this.images.length === 0) {
                    layersList.innerHTML = '<p style="color: #666; text-align: center; padding: 20px;">ยังไม่มี Layers</p>';
                    return;
                }

                // Reverse order so top layer appears first
                const reversedImages = [...this.images].reverse();
                
                for (let imgData of reversedImages) {
                    const item = document.createElement('div');
                    item.className = 'layer-item';
                    if (this.selectedImage && this.selectedImage.id === imgData.id) {
                        item.classList.add('selected');
                    }
                    if (imgData.locked) {
                        item.classList.add('locked');
                    }

                    item.innerHTML = `
                        <img src="${imgData.imgSrc}" class="layer-thumbnail">
                        <div class="layer-info">
                            <div class="layer-name">${imgData.name}</div>
                            <div class="layer-details">
                                ${Math.round(imgData.width * imgData.scale)}×${Math.round(imgData.height * imgData.scale)}px
                                ${imgData.locked ? '🔒' : ''}
                            </div>
                        </div>
                        <div class="layer-controls">
                            <button class="layer-control-btn ${imgData.locked ? 'active' : ''}" 
                                    onclick="vtt.toggleLockLayer(${imgData.id})" 
                                    title="${imgData.locked ? 'Unlock' : 'Lock'}">
                                ${imgData.locked ? '🔒' : '🔓'}
                            </button>
                            <button class="layer-control-btn" 
                                    onclick="vtt.selectAsset(${imgData.id})"
                                    title="Select">
                                👁️
                            </button>
                        </div>
                    `;
                    
                    item.addEventListener('click', (e) => {
                        if (!e.target.classList.contains('layer-control-btn')) {
                            this.selectAsset(imgData.id);
                        }
                    });
                    
                    layersList.appendChild(item);
                }
            }

            toggleLockLayer(id) {
                const img = this.images.find(img => img.id === id);
                if (img) {
                    img.locked = !img.locked;
                    this.updateLayersList();
                    this.saveToStorage();
                }
            }

            toggleLock() {
                if (this.selectedImage) {
                    this.selectedImage.locked = !this.selectedImage.locked;
                    this.updateLayersList();
                    this.render();
                    this.saveToStorage();
                    this.hideContextMenu();
                }
            }

            drawRulerPreview(x, y) {
                if (this.rulerPoints.length === 0) return;

                const start = this.rulerPoints[0];
                const dx = x - start.x;
                const dy = y - start.y;
                const distancePx = Math.sqrt(dx * dx + dy * dy);
                const distanceFt = (distancePx / this.pixelsPerFoot).toFixed(1);

                this.ctx.strokeStyle = this.drawColor;
                this.ctx.lineWidth = this.brushSize;
                this.ctx.globalAlpha = this.drawOpacity;
                this.ctx.setLineDash([5, 5]);

                this.ctx.beginPath();
                this.ctx.moveTo(start.x, start.y);
                this.ctx.lineTo(x, y);
                this.ctx.stroke();

                // Draw distance preview
                this.ctx.globalAlpha = 1;
                this.ctx.setLineDash([]);
                const midX = (start.x + x) / 2;
                const midY = (start.y + y) / 2;
                
                this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
                this.ctx.font = 'bold 14px Arial';
                const text = distanceFt + 'ft (' + Math.round(distancePx) + 'px)';
                const textWidth = this.ctx.measureText(text).width;
                this.ctx.fillRect(midX - textWidth / 2 - 5, midY - 12, textWidth + 10, 20);
                this.ctx.fillStyle = '#ffd700';
                this.ctx.fillText(text, midX - textWidth / 2, midY + 3);
            }

        }

        // Initialize VTT
        const vtt = new VTT();

        // Handle Enter key in rename modal
        document.getElementById('imageNameInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                vtt.confirmRename();
            }
        });

        // Handle draw color change
        document.getElementById('drawColor').addEventListener('input', (e) => {
            vtt.drawColor = e.target.value;
        });

        // Handle asset search
        document.getElementById('assetSearch').addEventListener('input', (e) => {
            vtt.filterAssets(e.target.value);
        });
