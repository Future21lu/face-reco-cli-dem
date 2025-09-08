import React, { useEffect, useRef, useState } from 'react'
import { API_ENDPOINTS } from '../config.js'

export default function ClientVerify() {
    const [msg, setMsg] = useState('')
    const [ok, setOk] = useState(false)
    const videoRef = useRef(null)
    const canvasRef = useRef(null)
    const [streaming, setStreaming] = useState(false)
    const timerRef = useRef(null)
    const [live, setLive] = useState(false)
    const [facing, setFacing] = useState('user') // 'user' | 'environment'
    const [fullscreen, setFullscreen] = useState(false)
    const [isTransitioning, setIsTransitioning] = useState(false)
    const containerRef = useRef(null)

    const startWithFacing = async (targetFacing) => {
        try {
            const current = videoRef.current && videoRef.current.srcObject
            if (current && current.getTracks) current.getTracks().forEach(t => t.stop())
            let stream = null
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: targetFacing } } })
            } catch (_) {
                try {
                    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: targetFacing } } })
                } catch (__) {
                    stream = await navigator.mediaDevices.getUserMedia({ video: true })
                }
            }
            if (videoRef.current) {
                videoRef.current.srcObject = stream
                setStreaming(true)
            }
            setFacing(targetFacing)
            setMsg('Camera started'); setOk(true)
        } catch (e) {
            setMsg('Failed to start camera: ' + e); setOk(false)
        }
    }

    // Enhanced fullscreen with smooth transition
    const enterFullscreen = async () => {
        setIsTransitioning(true)
        setFullscreen(true)
        
        // Wait for state to update and animation to start
        await new Promise(resolve => setTimeout(resolve, 50))
        
        const el = containerRef.current
        if (el && el.requestFullscreen) {
            try {
                await el.requestFullscreen()
            } catch (e) {
                console.log('Fullscreen not supported or denied')
            }
        } else if (el && el.webkitRequestFullscreen) {
            try {
                await el.webkitRequestFullscreen()
            } catch (e) {
                console.log('Webkit fullscreen not supported')
            }
        }
        
        // Complete transition after animation
        setTimeout(() => setIsTransitioning(false), 500)
    }

    const exitFullscreen = async () => {
        setIsTransitioning(true)
        
        if (document.exitFullscreen) {
            try {
                await document.exitFullscreen()
            } catch (e) {
                console.log('Exit fullscreen failed')
            }
        } else if (document.webkitExitFullscreen) {
            try {
                await document.webkitExitFullscreen()
            } catch (e) {
                console.log('Webkit exit fullscreen failed')
            }
        }
        
        setFullscreen(false)
        setTimeout(() => setIsTransitioning(false), 500)
    }

    // Listen for fullscreen changes
    useEffect(() => {
        const handleFs = () => {
            const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement)
            if (!isFs && fullscreen) {
                setFullscreen(false)
                setIsTransitioning(false)
            }
        }
        document.addEventListener('fullscreenchange', handleFs)
        document.addEventListener('webkitfullscreenchange', handleFs)
        document.addEventListener('msfullscreenchange', handleFs)
        return () => {
            document.removeEventListener('fullscreenchange', handleFs)
            document.removeEventListener('webkitfullscreenchange', handleFs)
            document.removeEventListener('msfullscreenchange', handleFs)
        }
    }, [fullscreen])

    // Camera controls
    const [cameraOn, setCameraOn] = useState(false)
    const start = async () => {
        await startWithFacing(facing)
        setCameraOn(true)
    }
    
    const stopCamera = () => {
        const v = videoRef.current
        const s = v && v.srcObject
        if (s && s.getTracks) s.getTracks().forEach(t => t.stop())
        setStreaming(false)
        setCameraOn(false)
        setMsg('Camera stopped'); setOk(false)
    }

    const switchCamera = async () => {
        const next = facing === 'user' ? 'environment' : 'user'
        setMsg('Switching camera...')
        try { await startWithFacing(next) } catch { }
    }

    const verify = async () => {
        if (!streaming) {
            await start()
        }
        
        // Smooth transition to fullscreen
        await enterFullscreen()
        
        const video = videoRef.current
        const canvas = canvasRef.current
        if (video.videoWidth && video.videoHeight) {
            canvas.width = video.videoWidth
            canvas.height = video.videoHeight
        }
        const ctx = canvas.getContext('2d')

        // Always apply mirror effect
        ctx.save()
        ctx.translate(canvas.width, 0)
        ctx.scale(-1, 1)
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        ctx.restore()

        canvas.toBlob(async (blob) => {
            const fd = new FormData()
            fd.append('file', blob, 'verify.jpg')
            setMsg('Verifying...'); setOk(false)
            try {
                const res = await fetch(API_ENDPOINTS.MATCH, { method: 'POST', body: fd })
                const data = await res.json()
                if (!res.ok) throw new Error(data.detail || 'No match')
                setMsg(`Attendance marked! Welcome, ${data.user_id}`); setOk(true)
            } catch (err) {
                setMsg(String(err)); setOk(false)
            }
        }, 'image/jpeg')
    }

    const startLive = async () => {
        if (!streaming) { 
            await start() 
        }
        
        // Smooth transition to fullscreen
        await enterFullscreen()
        
        if (timerRef.current) return
        setLive(true)
        const INTERVAL_MS = 2000
        const tick = async () => {
            const video = videoRef.current
            const canvas = canvasRef.current
            if (video.videoWidth && video.videoHeight) {
                canvas.width = video.videoWidth
                canvas.height = video.videoHeight
            }
            const ctx = canvas.getContext('2d')

            // Always apply mirror effect
            ctx.save()
            ctx.translate(canvas.width, 0)
            ctx.scale(-1, 1)
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
            ctx.restore()

            canvas.toBlob(async (blob) => {
                const fd = new FormData()
                fd.append('file', blob, 'frame.jpg')
                try {
                    const res = await fetch(API_ENDPOINTS.STREAM, { method: 'POST', body: fd })
                    const data = await res.json()
                    if (res.ok && data.user_id) {
                        setMsg(`Welcome, ${data.user_id}! ${data.created ? '(New attendance)' : '(Already present)'}`); setOk(true)
                    } else {
                        const sc = typeof data.score === 'number' ? ` (Confidence: ${(data.score * 100).toFixed(1)}%)` : ''
                        setMsg(`No face match found${sc}`); setOk(false)
                    }
                } catch (e) {
                    setMsg(String(e)); setOk(false)
                }
            }, 'image/jpeg')
        }
        timerRef.current = setInterval(tick, INTERVAL_MS)
        setMsg('Live verification started'); setOk(true)
    }

    const stopLive = async () => {
        if (timerRef.current) { 
            clearInterval(timerRef.current); 
            timerRef.current = null 
        }
        setLive(false)
        stopCamera()
        await exitFullscreen()
        setMsg('Live verification stopped')
    }

    useEffect(() => () => {
        if (timerRef.current) clearInterval(timerRef.current)
        const v = videoRef.current
        const s = v && v.srcObject
        if (s && s.getTracks) s.getTracks().forEach(t => t.stop())
    }, [])

    return (
        <div 
            ref={containerRef} 
            className={`transition-all duration-500 ease-in-out ${
                fullscreen 
                    ? 'fixed inset-0 z-50 bg-gray-900 flex flex-col w-full h-full' 
                    : 'max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8'
            } ${isTransitioning ? 'transform' : ''}`}
        >
            {/* Welcome Section (hide in fullscreen) */}
            {!fullscreen && (
                <div className={`text-center mb-4 sm:mb-8 transition-opacity duration-300 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}>
                    <h2 className="text-2xl sm:text-4xl font-bold text-white mb-2 sm:mb-4">
                        Welcome to <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400">PresenSense</span>
                    </h2>
                </div>
            )}

            {/* Main Card */}
            <div className={`transition-all duration-500 ease-in-out ${
                fullscreen 
                    ? 'flex-1 flex flex-col w-full h-full bg-gray-900' 
                    : 'bg-white/10 backdrop-blur-xl rounded-3xl border border-white/20 shadow-2xl p-4 sm:p-8'
            }`}>
                <div className={`transition-all duration-500 ${
                    fullscreen 
                        ? 'flex-1 flex flex-col w-full h-full' 
                        : 'grid lg:grid-cols-2 gap-4 sm:gap-8'
                }`}>
                    
                    {/* Video Section */}
                    <div className={`transition-all duration-500 ${
                        fullscreen 
                            ? 'flex-1 flex flex-col w-full h-full relative' 
                            : 'space-y-2 sm:space-y-4'
                    }`}>
                        {!fullscreen && (
                            <h3 className="mt-4 text-xl font-semibold text-white mb-2 sm:mb-4 flex items-center">
                                <svg className="mt-1 w-6 h-6 mr-2 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                                Camera Feed
                            </h3>
                        )}
                        
                        <div className={`relative transition-all duration-500 ${
                            fullscreen 
                                ? 'flex-1 w-full h-full flex items-center justify-center bg-black' 
                                : ''
                        }`}>
                            <video
                                className={`transition-all duration-500 ease-in-out ${
                                    fullscreen 
                                        ? 'w-full h-full object-cover scale-x-[-1] rounded-none' 
                                        : 'w-full aspect-video rounded-2xl bg-black/50 border border-white/10 scale-x-[-1]'
                                }`}
                                ref={videoRef}
                                autoPlay
                                playsInline
                            />
                            
                            {/* Status Indicator - only show when not in fullscreen */}
                            {!fullscreen && (
                                <div className="absolute bottom-3 left-3 transition-opacity duration-300">
                                    <div className={`flex items-center px-3 py-1 rounded-full text-xs font-medium backdrop-blur-sm ${
                                        streaming
                                            ? 'bg-green-500/80 text-white border border-green-400/50'
                                            : 'bg-red-500/80 text-white border border-red-400/50'
                                    }`}>
                                        <div className={`w-2 h-2 rounded-full mr-2 ${
                                            streaming ? 'bg-green-300 animate-pulse' : 'bg-red-300'
                                        }`} />
                                        {streaming ? 'Live' : 'Offline'}
                                    </div>
                                </div>
                            )}
                        </div>
                        
                        <canvas ref={canvasRef} style={{ display: 'none' }} />
                    </div>

                    {/* Controls Section (hide in fullscreen, replaced by floating controls) */}
                    {!fullscreen && (
                        <div className={`space-y-6 transition-opacity duration-300 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}>
                            <h3 className="text-xl font-semibold text-white flex items-center">
                                <svg className="w-6 h-6 mr-2 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
                                </svg>
                                Camera Controls
                            </h3>

                            {/* Control Buttons */}
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={cameraOn ? stopCamera : start}
                                    className={`flex items-center justify-center px-4 py-3 rounded-xl font-medium transition-all duration-200 shadow-lg transform hover:scale-105 ${
                                        cameraOn 
                                            ? 'bg-red-600 hover:bg-red-700 text-white' 
                                            : 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white'
                                    }`}
                                >
                                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={cameraOn ? "M6 18L18 6M6 6l12 12" : "M14.828 14.828a4 4 0 01-5.656 0M9 10h1.586a1 1 0 00.707-.293l.707-.707M9 10v4a1 1 0 001 1h4M9 10H7a2 2 0 00-2 2v4a2 2 0 002 2h10a2 2 0 002-2v-4a2 2 0 00-2-2H9z"} />
                                    </svg>
                                    {cameraOn ? 'Stop Camera' : 'Start Camera'}
                                </button>
                                
                                <button
                                    onClick={switchCamera}
                                    className="flex items-center justify-center px-4 py-3 bg-white/10 border border-white/20 text-white rounded-xl font-medium hover:bg-white/20 transition-all duration-200 transform hover:scale-105"
                                >
                                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                                    </svg>
                                    Switch Camera
                                </button>
                            </div>

                            {/* Verification Methods */}
                            <div className="space-y-3">
                                <h4 className="text-white font-medium">Verification Methods</h4>
                                
                                <button
                                    onClick={verify}
                                    className="w-full flex items-center justify-center px-6 py-4 bg-gradient-to-r from-purple-500 to-blue-600 text-white rounded-xl font-medium hover:from-purple-600 hover:to-blue-700 transition-all duration-200 shadow-lg transform hover:scale-105"
                                >
                                    <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                    Capture & Verify
                                </button>
                                
                                {!live ? (
                                    <button
                                        onClick={startLive}
                                        className="w-full flex items-center justify-center px-6 py-4 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl font-medium hover:from-orange-600 hover:to-red-700 transition-all duration-200 shadow-lg transform hover:scale-105"
                                    >
                                        <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                        </svg>
                                        Start Live Verification
                                    </button>
                                ) : (
                                    <button
                                        onClick={stopLive}
                                        className="w-full flex items-center justify-center px-6 py-4 bg-gradient-to-r from-gray-500 to-gray-600 text-white rounded-xl font-medium hover:from-gray-600 hover:to-gray-700 transition-all duration-200 transform hover:scale-105"
                                    >
                                        <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                                        </svg>
                                        Stop Live Verification
                                    </button>
                                )}
                            </div>

                            {/* Status Display */}
                            {msg && (
                                <div className={`p-4 rounded-xl border transition-all duration-200 ${
                                    ok
                                        ? 'bg-green-500/20 border-green-500/30 text-green-200'
                                        : 'bg-red-500/20 border-red-500/30 text-red-200'
                                }`}>
                                    <div className="flex items-center">
                                        {ok ? (
                                            <svg className="w-5 h-5 mr-2 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                        ) : (
                                            <svg className="w-5 h-5 mr-2 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                        )}
                                        <span className="font-medium">{msg}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Google Meet Style Floating Control Bar (only in fullscreen) */}
            {fullscreen && (
                <div className={`fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 transition-all duration-300 ${
                    isTransitioning ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'
                }`}>
                    <div className="bg-gray-800/95 backdrop-blur-xl rounded-full border border-gray-600/50 shadow-2xl px-6 py-4">
                        <div className="flex items-center space-x-4">
                            {/* Camera Toggle */}
                            <button
                                onClick={cameraOn ? stopCamera : start}
                                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 transform hover:scale-110 ${
                                    cameraOn 
                                        ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg' 
                                        : 'bg-green-600 hover:bg-green-700 text-white shadow-lg'
                                }`}
                                title={cameraOn ? 'Stop Camera' : 'Start Camera'}
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={cameraOn ? "M6 18L18 6M6 6l12 12" : "M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"} />
                                </svg>
                            </button>

                            {/* Switch Camera */}
                            <button
                                onClick={switchCamera}
                                className="w-12 h-12 rounded-full bg-gray-700 hover:bg-gray-600 text-white flex items-center justify-center transition-all duration-200 transform hover:scale-110 shadow-lg"
                                title="Switch Camera"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                                </svg>
                            </button>

                            {/* Capture */}
                            <button
                                onClick={verify}
                                className="w-12 h-12 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center transition-all duration-200 transform hover:scale-110 shadow-lg"
                                title="Capture & Verify"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                            </button>

                            {/* Live Toggle */}
                            {!live ? (
                                <button
                                    onClick={startLive}
                                    className="w-12 h-12 rounded-full bg-orange-600 hover:bg-orange-700 text-white flex items-center justify-center transition-all duration-200 transform hover:scale-110 shadow-lg"
                                    title="Start Live Verification"
                                >
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                </button>
                            ) : (
                                <button
                                    onClick={stopLive}
                                    className="w-12 h-12 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center transition-all duration-200 transform hover:scale-110 shadow-lg animate-pulse"
                                    title="Stop Live Verification"
                                >
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                                    </svg>
                                </button>
                            )}

                            {/* Exit Fullscreen */}
                            <button
                                onClick={exitFullscreen}
                                className="w-12 h-12 rounded-full bg-gray-700 hover:bg-gray-600 text-white flex items-center justify-center transition-all duration-200 transform hover:scale-110 shadow-lg"
                                title="Exit Fullscreen"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Status Message in Fullscreen */}
            {fullscreen && msg && (
                <div className={`fixed top-6 left-1/2 transform -translate-x-1/2 z-40 transition-all duration-300 ${
                    isTransitioning ? 'opacity-0 -translate-y-4' : 'opacity-100 translate-y-0'
                }`}>
                    <div className={`px-6 py-3 rounded-full backdrop-blur-xl border shadow-lg ${
                        ok
                            ? 'bg-green-500/20 border-green-500/30 text-green-200'
                            : 'bg-red-500/20 border-red-500/30 text-red-200'
                    }`}>
                        <div className="flex items-center">
                            {ok ? (
                                <svg className="w-5 h-5 mr-2 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            ) : (
                                <svg className="w-5 h-5 mr-2 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            )}
                            <span className="font-medium">{msg}</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Instructions (hide in fullscreen) */}
            {!fullscreen && (
                <div className={`mt-8 p-6 bg-white/5 rounded-2xl border border-white/10 transition-opacity duration-300 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}>
                    <h4 className="text-white font-semibold mb-3 flex items-center">
                        <svg className="w-5 h-5 mr-2 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Instructions
                    </h4>
                    <div className="grid sm:grid-cols-2 gap-4 text-sm text-white/70">
                        <div className="flex items-start">
                            <div className="w-6 h-6 bg-purple-500/20 rounded-full flex items-center justify-center mr-3 mt-0.5">
                                <span className="text-purple-300 font-semibold text-xs">1</span>
                            </div>
                            <div>
                                <strong className="text-white">Start Camera:</strong> Click "Start Camera" to begin
                            </div>
                        </div>
                        <div className="flex items-start">
                            <div className="w-6 h-6 bg-purple-500/20 rounded-full flex items-center justify-center mr-3 mt-0.5">
                                <span className="text-purple-300 font-semibold text-xs">2</span>
                            </div>
                            <div>
                                <strong className="text-white">Position Face:</strong> Ensure good lighting and clear visibility
                            </div>
                        </div>
                        <div className="flex items-start">
                            <div className="w-6 h-6 bg-purple-500/20 rounded-full flex items-center justify-center mr-3 mt-0.5">
                                <span className="text-purple-300 font-semibold text-xs">3</span>
                            </div>
                            <div>
                                <strong className="text-white">Fullscreen Mode:</strong> Verification automatically enters fullscreen
                            </div>
                        </div>
                        <div className="flex items-start">
                            <div className="w-6 h-6 bg-purple-500/20 rounded-full flex items-center justify-center mr-3 mt-0.5">
                                <span className="text-purple-300 font-semibold text-xs">4</span>
                            </div>
                            <div>
                                <strong className="text-white">Controls:</strong> Use floating buttons to control camera and verification
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}