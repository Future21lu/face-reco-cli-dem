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
    const [facing, setFacing] = useState('user')
    const [fullscreen, setFullscreen] = useState(false)
    const [isAnimating, setIsAnimating] = useState(false)
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

    // Google Meet style fullscreen transition
    const enterFullscreen = async () => {
        setIsAnimating(true)
        setFullscreen(true)
        
        // Smooth animation delay
        await new Promise(resolve => setTimeout(resolve, 300))
        setIsAnimating(false)
    }

    const exitFullscreen = async () => {
        setIsAnimating(true)
        await new Promise(resolve => setTimeout(resolve, 200))
        setFullscreen(false)
        setIsAnimating(false)
    }

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
        
        // Enter Google Meet style fullscreen
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
        
        // Enter Google Meet style fullscreen
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
        <>
            {/* Main Interface */}
            <div className={`max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 transition-all duration-300 ${fullscreen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                {/* Welcome Section */}
                <div className="text-center mb-4 sm:mb-8">
                    <h2 className="text-2xl sm:text-4xl font-bold text-white mb-2 sm:mb-4">
                        Welcome to <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400">PresenSense</span>
                    </h2>
                </div>

                {/* Main Card */}
                <div className="bg-white/10 backdrop-blur-xl rounded-3xl border border-white/20 shadow-2xl p-4 sm:p-8">
                    <div className="grid lg:grid-cols-2 gap-4 sm:gap-8">
                        {/* Video Section */}
                        <div className="space-y-2 sm:space-y-4">
                            <h3 className="mt-4 text-xl font-semibold text-white mb-2 sm:mb-4 flex items-center">
                                <svg className="mt-1 w-6 h-6 mr-2 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                                Camera Feed
                            </h3>
                            <div className="relative">
                                <video
                                    className="w-full aspect-video rounded-2xl bg-black/50 border border-white/10 scale-x-[-1]"
                                    ref={videoRef}
                                    autoPlay
                                    playsInline
                                />
                                {/* Status Indicator */}
                                <div className="absolute bottom-3 left-3">
                                    <div className={`flex items-center px-3 py-1 rounded-full text-xs font-medium ${streaming
                                        ? 'bg-green-500/80 text-white'
                                        : 'bg-red-500/80 text-white'
                                        }`}>
                                        <div className={`w-2 h-2 rounded-full mr-2 ${streaming ? 'bg-green-300' : 'bg-red-300'
                                            }`} />
                                        {streaming ? 'Live' : 'Offline'}
                                    </div>
                                </div>
                            </div>
                            <canvas ref={canvasRef} style={{ display: 'none' }} />
                        </div>

                        {/* Controls Section */}
                        <div className="space-y-6">
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
                                    className={`flex items-center justify-center px-4 py-3 ${cameraOn ? 'bg-red-600 hover:bg-red-700' : 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700'} text-white rounded-xl font-medium transition-all duration-200 shadow-lg`}
                                >
                                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={cameraOn ? "M6 18L18 6M6 6l12 12" : "M14.828 14.828a4 4 0 01-5.656 0M9 10h1.586a1 1 0 00.707-.293l.707-.707M9 10v4a1 1 0 001 1h4M9 10H7a2 2 0 00-2 2v4a2 2 0 002 2h10a2 2 0 002-2v-4a2 2 0 00-2-2H9z"} />
                                    </svg>
                                    {cameraOn ? 'Stop Camera' : 'Start Camera'}
                                </button>
                                <button
                                    onClick={switchCamera}
                                    className="flex items-center justify-center px-4 py-3 bg-white/10 border border-white/20 text-white rounded-xl font-medium hover:bg-white/20 transition-all duration-200"
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
                                    className="w-full flex items-center justify-center px-6 py-4 bg-gradient-to-r from-purple-500 to-blue-600 text-white rounded-xl font-medium hover:from-purple-600 hover:to-blue-700 transition-all duration-200 shadow-lg"
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
                                        className="w-full flex items-center justify-center px-6 py-4 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl font-medium hover:from-orange-600 hover:to-red-700 transition-all duration-200 shadow-lg"
                                    >
                                        <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                        </svg>
                                        Start Live Verification
                                    </button>
                                ) : (
                                    <button
                                        onClick={stopLive}
                                        className="w-full flex items-center justify-center px-6 py-4 bg-gradient-to-r from-gray-500 to-gray-600 text-white rounded-xl font-medium hover:from-gray-600 hover:to-gray-700 transition-all duration-200"
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
                                <div className={`p-4 rounded-xl border ${ok
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
                    </div>
                </div>

                {/* Instructions */}
                <div className="mt-8 p-6 bg-white/5 rounded-2xl border border-white/10">
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
                                <strong className="text-white">Single Capture:</strong> Use "Capture & Verify" for one-time check
                            </div>
                        </div>
                        <div className="flex items-start">
                            <div className="w-6 h-6 bg-purple-500/20 rounded-full flex items-center justify-center mr-3 mt-0.5">
                                <span className="text-purple-300 font-semibold text-xs">4</span>
                            </div>
                            <div>
                                <strong className="text-white">Live Mode:</strong> Use "Live Verification" for automatic scanning
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Google Meet Style Fullscreen Overlay */}
            {fullscreen && (
                <div className={`fixed inset-0 z-50 bg-gray-900 transition-all duration-300 ${
                    isAnimating ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
                }`}>
                    {/* Video Container */}
                    <div className="relative w-full h-full flex items-center justify-center">
                        <video
                            className="w-full h-full object-cover scale-x-[-1]"
                            ref={videoRef}
                            autoPlay
                            playsInline
                        />
                        
                        {/* Top Status Bar */}
                        <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/50 to-transparent">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-3">
                                    <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                                    <span className="text-white font-medium">
                                        {live ? 'Live Verification Active' : 'Camera Active'}
                                    </span>
                                </div>
                                <button
                                    onClick={exitFullscreen}
                                    className="w-10 h-10 bg-black/30 hover:bg-black/50 rounded-full flex items-center justify-center text-white transition-all duration-200"
                                >
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        {/* Status Message */}
                        {msg && (
                            <div className="absolute top-20 left-1/2 transform -translate-x-1/2">
                                <div className={`px-6 py-3 rounded-full backdrop-blur-lg border shadow-lg ${
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

                        {/* Google Meet Style Bottom Controls */}
                        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2">
                            <div className="bg-gray-800/90 backdrop-blur-xl rounded-full px-6 py-4 shadow-2xl border border-gray-600/30">
                                <div className="flex items-center space-x-4">
                                    {/* Microphone (Disabled) */}
                                    <div className="w-14 h-14 bg-gray-600/50 rounded-full flex items-center justify-center cursor-not-allowed opacity-50">
                                        <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6" />
                                        </svg>
                                    </div>

                                    {/* Camera Toggle */}
                                    <button
                                        onClick={cameraOn ? stopCamera : start}
                                        className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 shadow-lg ${
                                            cameraOn 
                                                ? 'bg-white text-gray-800 hover:bg-gray-100' 
                                                : 'bg-red-600 text-white hover:bg-red-700'
                                        }`}
                                    >
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={cameraOn ? "M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" : "M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18 21l-4.5-4.5m0 0L8 21l5-5 5-5m0 0L18 3l-4.5 4.5M13.5 13.5L8 8"} />
                                        </svg>
                                    </button>

                                    {/* End Call / Exit */}
                                    <button
                                        onClick={live ? stopLive : exitFullscreen}
                                        className="w-14 h-14 bg-red-600 hover:bg-red-700 rounded-full flex items-center justify-center text-white transition-all duration-200 hover:scale-110 shadow-lg"
                                    >
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 3l1.664 1.664M21 21l-1.5-1.5m-5.485-1.242L12 17l-1.5-1.5m0 0L9 14l-1.5 1.5m0 0L6 17l-1.5-1.5M21 3l-9 9m0 0L3 21" />
                                        </svg>
                                    </button>

                                    {/* Switch Camera */}
                                    <button
                                        onClick={switchCamera}
                                        className="w-14 h-14 bg-gray-700 hover:bg-gray-600 rounded-full flex items-center justify-center text-white transition-all duration-200 hover:scale-110 shadow-lg"
                                    >
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                                        </svg>
                                    </button>

                                    {/* More Options (Disabled) */}
                                    <div className="w-14 h-14 bg-gray-600/50 rounded-full flex items-center justify-center cursor-not-allowed opacity-50">
                                        <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                                        </svg>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Additional Action Buttons */}
                        <div className="absolute bottom-32 left-1/2 transform -translate-x-1/2">
                            <div className="flex space-x-4">
                                {!live && (
                                    <button
                                        onClick={verify}
                                        className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-full font-medium transition-all duration-200 hover:scale-105 shadow-lg"
                                    >
                                        📸 Capture & Verify
                                    </button>
                                )}
                                
                                {!live ? (
                                    <button
                                        onClick={startLive}
                                        className="px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-full font-medium transition-all duration-200 hover:scale-105 shadow-lg"
                                    >
                                        🔴 Start Live Mode
                                    </button>
                                ) : (
                                    <button
                                        onClick={stopLive}
                                        className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-full font-medium transition-all duration-200 hover:scale-105 shadow-lg animate-pulse"
                                    >
                                        ⏹️ Stop Live Mode
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}