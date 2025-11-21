import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Textarea } from './ui/textarea';
import { Alert, AlertDescription } from './ui/alert';
import { toast } from 'sonner';
import { 
  Shield, 
  LogOut, 
  Upload, 
  MessageSquare, 
  Send, 
  Activity, 
  Eye, 
  Save,
  FileImage,
  Bot,
  User,
  RotateCcw,
  CheckCircle2,
  FileText
} from 'lucide-react';

interface DashboardProps {
  onLogout: () => void;
  userInfo?: {
    email?: string;
    name?: string;
    picture?: string;
    role?: string;
  };
}

// ===== TYPE DEFINITIONS FOR BACKEND INTEGRATION =====
interface AnalysisResult {
  diagnosis: string;
  confidence: number;
  timestamp: string;
  overlayImageUrl?: string;
}

interface GradCAMResult {
  overlayImageUrl: string;
  timestamp: string;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  message: string;
  timestamp: string;
}

interface VitalSigns {
  heartRate: number; // BPM (beats per minute)
  spO2: number; // SpO2 percentage (oxygen saturation)
  timestamp: string;
  status: 'normal' | 'warning' | 'critical' | 'no_signal';
}

export default function Dashboard({ onLogout, userInfo }: DashboardProps) {
  // ===== STATE MANAGEMENT =====
  // Image upload state
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  
  // Analysis state
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // Grad CAM state
  const [gradCAMResult, setGradCAMResult] = useState<GradCAMResult | null>(null);
  const [isGeneratingGradCAM, setIsGeneratingGradCAM] = useState(false);
  
  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      sender: 'ai',
      message: 'Hello! I\'m your AI assistant for leukemia analysis. How can I help you today?',
      timestamp: new Date().toISOString()
    }
  ]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);

  // Vital signs state - Default to no signal until sensor detects finger
  const [vitalSigns, setVitalSigns] = useState<VitalSigns>({
    heartRate: 0, // Will show "--" when 0
    spO2: 0, // Will show "--" when 0
    timestamp: new Date().toISOString(),
    status: 'no_signal' // Default to no signal (no connection or no finger)
  });
  

  // Example function to determine status based on sensor data
  const determineVitalSignsStatus = (heartRate: number, spO2: number, sensorConnected: boolean) => {
    // No signal (no connection or no finger detected)
    if (!sensorConnected || heartRate === 0 || spO2 === 0 || heartRate === null || spO2 === null) {
      return 'no_signal';
    }
    
    // Valid readings - determine medical status
    if (heartRate < 50 || heartRate > 120 || spO2 < 90) {
      return 'critical';
    }
    if (heartRate < 60 || heartRate > 100 || spO2 < 95) {
      return 'warning';
    }
    return 'normal';
  };

  // Chat scroll reference
  const chatMessagesRef = useRef<HTMLDivElement>(null);

  // ===== EFFECTS =====
  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
    }
  }, [chatMessages, isChatLoading]);

  // AWS API Gateway integration for Vital Signs with smart auto-start/stop
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;
    let checkIntervalId: NodeJS.Timeout | null = null;

    const fetchVitalSigns = async () => {
      try {
        // Fetch real data from your AWS API Gateway
        const vitalsUrl = import.meta.env.VITE_VITALS_API_URL || 'https://wbqi1yjvy2.execute-api.eu-north-1.amazonaws.com/prod/vitals';
        const response = await fetch(vitalsUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        if (response.ok) {
          const data = await response.json();
          console.log('AWS API Response:', data); // Debug log
          // Compute UI status: derive from bpm/spo2 unless truly no signal
          const uiStatus = data.status === 'disconnected'
            ? 'no_signal'
            : determineVitalSignsStatus(data.bpm, data.spo2, true);
          // Update vital signs with real data from ESP32
          setVitalSigns({
            heartRate: Math.round(data.bpm || 0),
            spO2: Math.round(data.spo2 || 0),
            timestamp: new Date().toISOString(),
            status: uiStatus
          });
          // AUTO-STOP: If status is no signal, stop polling
          if (data.status === 'disconnected') {
            console.log('No signal detected - stopping polling to save API calls');
            if (intervalId) {
              clearInterval(intervalId);
              intervalId = null;
            }
            return;
          }
        } else {
          // Handle API errors - no signal detected or API unavailable
          console.log('AWS API not responding. Response status:', response.status);
          setVitalSigns(prev => ({ 
            ...prev, 
            status: 'no_signal',
            timestamp: new Date().toISOString()
          }));
        }
        
      } catch (error) {
        console.error('Failed to fetch vital signs:', error);
        setVitalSigns(prev => ({ 
          ...prev, 
          status: 'no_signal',
          timestamp: new Date().toISOString()
        }));
      }
    };
    // Smart check function - checks if sensor is active and restarts polling
    const checkForSensorActivity = async () => {
      try {
        const vitalsUrl = import.meta.env.VITE_VITALS_API_URL || 'https://wbqi1yjvy2.execute-api.eu-north-1.amazonaws.com/prod/vitals';
        const response = await fetch(vitalsUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          
          // AUTO-START: If sensor becomes active and we're not polling, restart
          if ((data.status === 'active' || data.status === 'normal' || data.status === 'warning' || data.status === 'critical') && !intervalId) {
            console.log('Sensor detected - restarting automatic polling');
            
            // Compute UI status on resume
            const uiStatus = data.status === 'disconnected'
              ? 'no_signal'
              : determineVitalSignsStatus(data.bpm, data.spo2, true);
            
            // Update vital signs
            setVitalSigns({
              heartRate: Math.round(data.bpm || 0),
              spO2: Math.round(data.spo2 || 0),
              timestamp: new Date().toISOString(),
              status: uiStatus
            });
            
            // Restart polling
            intervalId = setInterval(fetchVitalSigns, 5000);
          }
        }
      } catch (error) {
        console.error('Failed to check sensor activity:', error);
      }
    };

    // Initial fetch
    fetchVitalSigns();

    // Set up polling every 5 seconds to get fresh data
    intervalId = setInterval(fetchVitalSigns, 5000);

    // Set up smart check every 10 seconds to detect when sensor becomes active
    checkIntervalId = setInterval(checkForSensorActivity, 10000);

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
      if (checkIntervalId) {
        clearInterval(checkIntervalId);
      }
    };
  }, []);
  

  // ===== IMAGE UPLOAD HANDLERS =====
  const handleImageUpload = useCallback((file: File) => {
    // Validate image file type and size
    const allowedTypes = ['image/jpeg', 'image/png', 'image/tiff'];
    const maxSize = 10 * 1024 * 1024; // 10MB limit

    if (!allowedTypes.includes(file.type)) {
      alert('Please upload a valid image file (JPEG, PNG, or TIFF)');
      return;
    }

    if (file.size > maxSize) {
      alert('File size must be less than 10MB');
      return;
    }

    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      setUploadedImage(e.target?.result as string);
    };
    reader.readAsDataURL(file);
    
    // Clear previous analysis results
    setAnalysisResult(null);
    setGradCAMResult(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const file = e.dataTransfer.files[0];
    if (file) {
      handleImageUpload(file);
    }
  }, [handleImageUpload]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  // ===== CLEAR/RESET FUNCTION =====
  /**
   * Clears all analysis data and resets the interface for a new analysis
   * This allows the doctor to start fresh with a new image
   */
  const handleClearAll = () => {
    // Clear image data
    setUploadedImage(null);
    setImageFile(null);
    
    // Clear analysis results
    setAnalysisResult(null);
    setGradCAMResult(null);
    
    // Reset loading states
    setIsAnalyzing(false);
    setIsGeneratingGradCAM(false);
    setIsChatLoading(false);
    
    // Reset chat conversation to initial state
    setChatMessages([
      {
        id: '1',
        sender: 'ai',
        message: 'Hello! I\'m your AI assistant for leukemia analysis. How can I help you today?',
        timestamp: new Date().toISOString()
      }
    ]);
    
    // Clear current message input
    setCurrentMessage('');
    
    // Reset drag state
    setIsDragOver(false);
  };

  const handleAnalyze = async () => {
    if (!imageFile) {
      alert('Please upload an image first');
      return;
    }

    setIsAnalyzing(true);
    const startTime = Date.now();
    console.log('[INFO] Starting analysis...', { fileName: imageFile.name, fileSize: imageFile.size });
    
    try {
      const formData = new FormData();
      formData.append('file', imageFile);
      
      const apiUrl = import.meta.env.VITE_API_URL || 'http://13.49.57.101:8000';
      console.log('[INFO] API URL:', apiUrl);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
          console.error('[TIMEOUT] Request took longer than 60 seconds', { elapsedSeconds: elapsed });
        controller.abort();
      }, 60000); // 60 second timeout (reduced from 120)
      
      console.log('[INFO] Sending request to backend...');
      const fetchStartTime = Date.now();
      
      let response: Response;
      try {
        response = await fetch(`${apiUrl}/api/analyze`, {
          method: 'POST',
          body: formData,
          signal: controller.signal,
          headers: {
            'Authorization': 'Bearer mock_token'
          }
        });
        const fetchTime = Math.round((Date.now() - fetchStartTime) / 1000);
        console.log(`[SUCCESS] Received response in ${fetchTime}s`, { status: response.status, statusText: response.statusText, ok: response.ok });
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        
        if (fetchError.name === 'AbortError') {
          console.error('[TIMEOUT] FETCH ABORTED: Request was cancelled (timeout)', { elapsedSeconds: elapsed });
          throw new Error(`[TIMEOUT] Request timed out after ${elapsed} seconds. The analysis is taking too long. This could mean:\n\n1. SageMaker endpoint is slow or cold starting\n2. Backend is not responding\n3. Network issues\n\nPlease try again.`);
        } else if (fetchError.message?.includes('Failed to fetch')) {
          console.error('[NETWORK ERROR] Cannot reach backend', { error: fetchError.message });
          throw new Error(`[NETWORK ERROR] Cannot connect to backend at ${apiUrl}\n\nPlease check:\n1. Backend is running\n2. Network connection\n3. CORS settings`);
        } else {
          console.error('[ERROR] FETCH ERROR:', fetchError);
          throw new Error(`[ERROR] Request failed: ${fetchError.message || 'Unknown error'}`);
        }
      }
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorMessage = `Server returned ${response.status} ${response.statusText}`;
        let errorDetails: any = null;
        
        try {
          const errorText = await response.text();
          console.error('[ERROR] Error response body:', errorText);
          
          try {
            errorDetails = JSON.parse(errorText);
            console.error('[ERROR] Parsed error:', errorDetails);
            errorMessage = errorDetails.detail || errorDetails.error || errorDetails.message || errorMessage;
          } catch (e) {
            errorMessage = errorText || errorMessage;
          }
        } catch (e) {
          console.error('[ERROR] Could not read error response:', e);
        }
        
        if (response.status === 500) {
          throw new Error(`[ERROR] Server Error (500): ${errorMessage}\n\nThis usually means:\n1. SageMaker endpoint crashed\n2. Backend code error\n3. Model loading failed\n\nCheck CloudWatch logs for details.`);
        } else if (response.status === 503) {
          throw new Error(`[SERVICE UNAVAILABLE] Service Unavailable (503): ${errorMessage}\n\nSageMaker endpoint might be:\n1. Still starting up\n2. Overloaded\n3. Unavailable\n\nWait a moment and try again.`);
        } else if (response.status === 504) {
          throw new Error(`[TIMEOUT] Gateway Timeout (504): ${errorMessage}\n\nBackend took too long to respond.\n\nThis could mean:\n1. SageMaker is processing (first request is slow)\n2. Model is loading\n3. Network issues\n\nTry again - subsequent requests should be faster.`);
        } else {
          throw new Error(`[ERROR] HTTP ${response.status}: ${errorMessage}`);
        }
      }

      console.log('[INFO] Parsing response JSON...');
      const result: AnalysisResult = await response.json();
      const totalTime = Math.round((Date.now() - startTime) / 1000);
      console.log(`[SUCCESS] Analysis complete in ${totalTime}s`, result);
      
      setAnalysisResult(result);
      setIsAnalyzing(false);
      
    } catch (error: any) {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.error('[ERROR] ANALYSIS FAILED:', {
        error,
        errorName: error?.name,
        errorMessage: error?.message,
        elapsedSeconds: elapsed,
        stack: error?.stack
      });
      
      setIsAnalyzing(false);
      
      let errorMessage = 'Analysis failed';
      if (error.name === 'AbortError' || error.message?.includes('timed out')) {
        errorMessage = error.message || `[TIMEOUT] Request timed out after ${elapsed} seconds. The analysis is taking too long. Please try again.`;
      } else if (error.message) {
        errorMessage = error.message;
      } else if (error instanceof Error) {
        errorMessage = error.toString();
      }
      
      alert(`[ERROR] Analysis Failed\n\n${errorMessage}\n\nElapsed time: ${elapsed}s\n\nCheck browser console (F12) for more details.`);
    }
  };
  const handleGradCAM = async () => {
    if (!imageFile || !analysisResult) {
      alert('Please analyze an image first before generating Grad CAM visualization');
      return;
    }

    setIsGeneratingGradCAM(true);
    const startTime = Date.now();
    console.log('[INFO] Starting Grad CAM generation...', { fileName: imageFile.name });
    
    try {
      const formData = new FormData();
      formData.append('file', imageFile);
      
      const apiUrl = import.meta.env.VITE_API_URL || 'http://13.49.57.101:8000';
      console.log('[INFO] Calling Grad CAM endpoint:', `${apiUrl}/api/generate-gradcam`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        console.error('[TIMEOUT] Grad CAM request took longer than 60 seconds', { elapsedSeconds: elapsed });
        controller.abort();
      }, 60000); // 60 second timeout
      
      const fetchStartTime = Date.now();
      let response: Response;
      
      try {
        response = await fetch(`${apiUrl}/api/generate-gradcam`, {
          method: 'POST',
          body: formData,
          signal: controller.signal,
          headers: {
            'Authorization': 'Bearer mock_token'
          }
        });
        const fetchTime = Math.round((Date.now() - fetchStartTime) / 1000);
        console.log(`[SUCCESS] Received Grad CAM response in ${fetchTime}s`, { status: response.status, ok: response.ok });
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        
        if (fetchError.name === 'AbortError') {
          console.error('[TIMEOUT] FETCH ABORTED: Grad CAM request timed out', { elapsedSeconds: elapsed });
          throw new Error(`[TIMEOUT] Grad CAM request timed out after ${elapsed} seconds. Please try again.`);
        } else if (fetchError.message?.includes('Failed to fetch')) {
          console.error('[NETWORK ERROR] Cannot reach backend for Grad CAM', { error: fetchError.message });
          throw new Error(`[NETWORK ERROR] Cannot connect to backend at ${apiUrl}`);
        } else {
          console.error('[ERROR] FETCH ERROR:', fetchError);
          throw new Error(`[ERROR] Request failed: ${fetchError.message || 'Unknown error'}`);
        }
      }
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorMessage = `Server returned ${response.status} ${response.statusText}`;
        
        try {
          const errorText = await response.text();
          console.error('[ERROR] Grad CAM error response:', errorText);
          
          try {
            const errorDetails = JSON.parse(errorText);
            errorMessage = errorDetails.detail || errorDetails.error || errorDetails.message || errorMessage;
          } catch (e) {
            errorMessage = errorText || errorMessage;
          }
        } catch (e) {
          console.error('[ERROR] Could not read error response:', e);
        }
        
        if (response.status === 500) {
          throw new Error(`[ERROR] Server Error (500): ${errorMessage}\n\nGrad CAM generation failed. Check if pytorch_grad_cam is available.`);
        } else {
          throw new Error(`[ERROR] HTTP ${response.status}: ${errorMessage}`);
        }
      }

      console.log('[INFO] Parsing Grad CAM response...');
      const gradcamData = await response.json();
      const totalTime = Math.round((Date.now() - startTime) / 1000);
      console.log(`[SUCCESS] Grad CAM complete in ${totalTime}s`, gradcamData);
      
      // Check if we have the overlay image URL
      const overlayUrl = gradcamData.overlayImageUrl;
      if (!overlayUrl || overlayUrl.trim() === '') {
        console.error('[ERROR] Empty overlayImageUrl in response', gradcamData);
        throw new Error('Grad CAM generated but no image URL returned. Response may be missing overlayImageUrl.');
      }
      
      console.log('[INFO] Setting Grad CAM result with overlay URL:', overlayUrl.substring(0, 50) + '...');
      
      // Set Grad CAM result
      const gradcamResult = {
        overlayImageUrl: overlayUrl,
        timestamp: gradcamData.timestamp || new Date().toISOString()
      };
      setGradCAMResult(gradcamResult);
      console.log('[SUCCESS] Grad CAM result state updated');
      
      // Also update analysis result with Grad CAM images
      setAnalysisResult({
        ...analysisResult,
        overlayImageUrl: overlayUrl
      });
      console.log('[SUCCESS] Analysis result updated with Grad CAM overlay');
      
      setIsGeneratingGradCAM(false);
      
    } catch (error: any) {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.error('[ERROR] GRAD CAM FAILED:', {
        error,
        errorName: error?.name,
        errorMessage: error?.message,
        elapsedSeconds: elapsed,
        stack: error?.stack
      });
      
      setIsGeneratingGradCAM(false);
      
      let errorMessage = 'Grad CAM visualization failed';
      if (error.message) {
        errorMessage = error.message;
      } else if (error instanceof Error) {
        errorMessage = error.toString();
      }
      
      alert(`[ERROR] Grad CAM Failed\n\n${errorMessage}\n\nElapsed time: ${elapsed}s\n\nCheck browser console (F12) for details.`);
    }
  };
  const handleSaveResult = async () => {
    if (!analysisResult) {
      return;
    }

    // Show loading indicator (find button by checking text content)
    let buttonElement: HTMLButtonElement | null = null;
    let buttonSpan: HTMLSpanElement | null = null;
    const allButtons = document.querySelectorAll('button');
    for (const btn of allButtons) {
      const btnText = btn.textContent?.trim();
      if (btnText === 'Save Result' || btnText?.includes('Save Result')) {
        buttonElement = btn as HTMLButtonElement;
        // Find the span element inside the button to preserve icon
        buttonSpan = btn.querySelector('span:last-child') as HTMLSpanElement;
        buttonElement.disabled = true;
        // Only update the text, keep the icon
        if (buttonSpan && buttonSpan.textContent) {
          buttonSpan.textContent = 'Generating PDF...';
        }
        break;
      }
    }

    try {
      
      // Dynamic import of jsPDF to avoid issues
      console.log('[INFO] Save Result clicked - Generating PDF');
      console.log('   ImageFile:', imageFile);
      console.log('   AnalysisResult:', analysisResult);
      
      // Import jsPDF
      const jsPDFModule = await import('jspdf');
      const jsPDF = jsPDFModule.jsPDF || jsPDFModule.default;
      if (!jsPDF) {
        throw new Error('jsPDF library not loaded correctly');}
      console.log('   jsPDF loaded successfully');
      // Get image file name (or use default if not available)
      const imageFileName = imageFile?.name || 'unknown_image';
      const diagnosis = analysisResult.diagnosis || 'Unknown';
      const confidence = analysisResult.confidence || 0;
      const currentDate = new Date();
      const dateStr = currentDate.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' });
      const timeStr = currentDate.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit' });
      // Create PDF document (A4 size, portrait)
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'});
      // Set up colors
      const primaryColor = [0, 102, 204]; // Blue
      const accentColor = [255, 102, 0]; // Orange
      const textColor = [51, 51, 51]; // Dark gray
      const lightGray = [245, 245, 245];
      let yPos = 20; // Starting Y position
      // Header Section
      pdf.setFillColor(...primaryColor);
      pdf.rect(0, 0, 210, 30, 'F');
      
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(24);
      pdf.setFont('helvetica', 'bold');
      pdf.text('HemaScan', 15, 18);
      
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.text('Leukemia Detection and Diagnosis System', 15, 25);
      
      yPos = 40;
      
      // Title
      pdf.setTextColor(...textColor);
      pdf.setFontSize(18);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Analysis Report', 15, yPos);
      yPos += 15;
      // Report Information Box
      pdf.setFillColor(...lightGray);
      pdf.roundedRect(15, yPos - 5, 180, 40, 3, 3, 'F');
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(...textColor);
      pdf.text(`Report Date: ${dateStr}`, 20, yPos + 5);
      pdf.text(`Report Time: ${timeStr}`, 20, yPos + 12);
      pdf.text(`Image File: ${imageFileName}`, 20, yPos + 19);
      pdf.text(`Report ID: ${currentDate.getTime()}`, 20, yPos + 26);
      yPos += 50;
      // Diagnosis Section
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...textColor);
      pdf.text('Diagnosis', 15, yPos);
      
      yPos += 8;
      
      pdf.setFillColor(...accentColor);
      pdf.roundedRect(15, yPos - 5, 180, 15, 3, 3, 'F');
      
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(16);
      pdf.setFont('helvetica', 'bold');
      pdf.text(diagnosis, 20, yPos + 5);
      
      yPos += 25;
      
      // Confidence Level Section
      pdf.setTextColor(...textColor);
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Confidence Level', 15, yPos);
      
      yPos += 10;
      
      // Confidence bar background
      pdf.setFillColor(...lightGray);
      pdf.roundedRect(15, yPos - 5, 180, 20, 3, 3, 'F');
      
      // Confidence bar fill (based on percentage)
      const barWidth = (confidence / 100) * 180;
      const barColor = confidence >= 80 ? [0, 153, 0] : confidence >= 60 ? [255, 153, 0] : [204, 0, 0];
      pdf.setFillColor(...barColor);
      pdf.roundedRect(15, yPos - 5, barWidth, 20, 3, 3, 'F');
      
      // Confidence percentage text
      pdf.setTextColor(...textColor);
      pdf.setFontSize(18);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`${confidence.toFixed(1)}%`, 20, yPos + 8);
      
      yPos += 35;
      
      // Important Notice Section (HIPAA Disclaimer)
      pdf.setFillColor(255, 255, 200); // Light yellow
      pdf.roundedRect(15, yPos - 5, 180, 50, 3, 3, 'F');
      
      pdf.setTextColor(...textColor);
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.text('IMPORTANT MEDICAL DISCLAIMER', 20, yPos);
      
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      const disclaimerText = [
        'This analysis report is generated by an AI-powered diagnostic system for',
        'educational and research purposes only. This report does NOT constitute',
        'a medical diagnosis, and should NOT be used as a substitute for',
        'professional medical advice, diagnosis, or treatment.',
        '',
        'Always consult with a qualified healthcare provider for proper medical',
        'evaluation and treatment decisions. The confidence levels and diagnoses',
        'presented are estimates and require clinical validation.'
      ];
      
      disclaimerText.forEach((line, index) => {
        pdf.text(line, 20, yPos + 8 + (index * 5));
      });
      
      yPos += 60;
      
      // Footer
      pdf.setDrawColor(200, 200, 200);
      pdf.line(15, yPos, 195, yPos);
      
      yPos += 10;
      
      pdf.setFontSize(8);
      pdf.setTextColor(150, 150, 150);
      pdf.setFont('helvetica', 'italic');
      pdf.text('This document contains Protected Health Information (PHI) and is subject to HIPAA regulations.', 15, yPos);
      pdf.text('Handle with appropriate security measures and only share with authorized personnel.', 15, yPos + 5);
      
      // Generate filename
      const baseFileName = imageFileName.replace(/\.[^/.]+$/, '') || 'analysis_result';
      const fileName = `${baseFileName}_analysis_report.pdf`;
      
      // Get PDF as blob first to ensure it's complete
      const pdfBlob = pdf.output('blob');
      
      // Create download link
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.style.display = 'none';
      
      // Append to body, click, then remove
      document.body.appendChild(link);
      link.click();
      
      // Cleanup after a short delay
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 100);
      
      console.log('[SUCCESS] PDF report generated and saved:', fileName);
      
      // Re-enable button
      if (buttonElement) {
        buttonElement.disabled = false;
        if (buttonSpan) {
          buttonSpan.textContent = 'Save Result';
        } else {
          buttonElement.textContent = 'Save Result';
        }
      }
      
      // Show success toast notification
      toast.success('Analysis Report Saved', {
        description: `${fileName} has been downloaded successfully.`,
        icon: <FileText className="w-4 h-4 text-green-600" />,
        duration: 4000,
      });
      
    } catch (error) {
      console.error('[ERROR] PDF generation failed:', error);
      console.error('   Error details:', error);
      console.error('   Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      
      // Re-enable button
      if (buttonElement) {
        buttonElement.disabled = false;
        if (buttonSpan) {
          buttonSpan.textContent = 'Save Result';
        } else {
          buttonElement.textContent = 'Save Result';
        }
      }
      
      // Show error toast notification
      toast.error('Failed to Save Report', {
        description: error instanceof Error ? error.message : 'An error occurred while generating the PDF. Please try again.',
        duration: 5000,
      });
    }
  };

  const handleSendMessage = async () => {
    if (!currentMessage.trim()) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      message: currentMessage,
      timestamp: new Date().toISOString()
    };

    setChatMessages(prev => [...prev, userMessage]);
    const messageToSend = currentMessage;
    setCurrentMessage('');
    setIsChatLoading(true);

    try {
      // Call backend chat API
      // Use EC2 backend for chatbot
      const apiUrl = import.meta.env.VITE_API_URL || 'http://13.49.57.101:8000';
      const chatApiUrl = `${apiUrl}/api/chat`;
      
      const response = await fetch(chatApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_token'
        },
        body: JSON.stringify({
          message: messageToSend,
          analysis_context: analysisResult,
          vital_signs: vitalSigns
        })
      });

      if (!response.ok) {
        // Try to get error details from response
        let errorDetail = `HTTP ${response.status}`;
        try {
          const errorData = await response.json();
          if (errorData.error) {
            errorDetail = errorData.error;
          } else if (errorData.message) {
            errorDetail = errorData.message;
          }
        } catch (e) {
          // Response might not be JSON
          const text = await response.text();
          if (text) errorDetail = text.substring(0, 200);
        }
        throw new Error(`Chat request failed: ${errorDetail}`);
      }

      const data = await response.json();
      
      // Check if backend returned an error in the response
      if (data.error) {
        throw new Error(data.error);
      }
      const aiMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        message: data.message,
        timestamp: new Date().toISOString()
      };
      
      setChatMessages(prev => [...prev, aiMessage]);
      setIsChatLoading(false);

    } catch (error: any) {
      console.error('[ERROR] Chat failed:', error);
      console.error('   Error type:', error?.constructor?.name);
      console.error('   Error message:', error?.message);
      console.error('   Error stack:', error?.stack);
      
      setIsChatLoading(false);
      
      // Try to extract more specific error information
      let errorText = 'Sorry, I encountered an error. Please try again.';
      
      if (error?.message) {
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
          errorText = 'Unable to connect to the chat service. Please check your internet connection and try again.';
        } else if (error.message.includes('Chat request failed')) {
          errorText = 'The chat service returned an error. Please try again in a moment.';
        } else {
          errorText = `Error: ${error.message}`;
        }
      }
      
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        message: errorText,
        timestamp: new Date().toISOString()
      };
      setChatMessages(prev => [...prev, errorMessage]);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 shadow-sm">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Hemascan</h1>
              <p className="text-xs text-slate-600">Leukemia Detection And Diagnosis System</p>
            </div>
          </div>
          
          <Button 
            onClick={onLogout}
            variant="outline"
            className="flex items-center space-x-2"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </Button>
        </div>
      </div>

      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Image Upload and Analysis Section */}
        <div className="lg:col-span-2 space-y-6">
          {/* Image Upload Box */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <FileImage className="w-5 h-5" />
                <span>Blood Smear Image Upload</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  isDragOver 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-slate-300 hover:border-slate-400'
                }`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
              >
                {uploadedImage ? (
                  <div className="space-y-4">
                    <img 
                      src={uploadedImage} 
                      alt="Uploaded blood smear" 
                      className="max-h-64 mx-auto rounded-lg shadow-sm"
                    />
                    <p className="text-sm text-slate-600">
                      Image uploaded successfully. Ready for analysis.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <Upload className="w-12 h-12 text-slate-400 mx-auto" />
                    <div>
                      <p className="text-lg font-medium text-slate-700">
                        Drop blood smear image here
                      </p>
                      <p className="text-sm text-slate-500">
                        or click to browse files (JPEG, PNG, TIFF)
                      </p>
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImageUpload(file);
                      }}
                      className="hidden"
                      id="image-upload"
                    />
                    <label htmlFor="image-upload">
                      <Button asChild>
                        <span>Browse Files</span>
                      </Button>
                    </label>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Analysis Results */}
          {analysisResult && (
            <Card>
              <CardHeader>
                <CardTitle>Analysis Results</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <Alert className="border-orange-200 bg-orange-50">
                    <AlertDescription className="text-orange-800">
                      <strong>Diagnosis:</strong> {analysisResult.diagnosis}
                    </AlertDescription>
                  </Alert>
                  
                  <div className="bg-slate-50 p-4 rounded-lg text-center">
                    <p className="text-sm text-slate-600 mb-1">Confidence Level</p>
                    <p className="text-2xl font-semibold text-slate-900">
                      {analysisResult.confidence}%
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Grad CAM Visualization Results */}
          {analysisResult && analysisResult.overlayImageUrl && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Eye className="w-5 h-5" />
                  <span>AI Diagnostic Focus Visualization</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <Alert className="border-blue-200 bg-blue-50">
                    <AlertDescription className="text-blue-800">
                      <strong>Grad CAM (Gradient-weighted Class Activation Mapping)</strong> reveals the specific regions of the blood smear that influenced the AI's diagnostic decision.
                      <span className="block mt-2">
                        <span className="font-medium text-red-600">Red/Orange regions:</span> High diagnostic importance (potential abnormalities)
                        <br />
                        <span className="font-medium text-blue-600">Blue/Purple regions:</span> Low diagnostic importance (normal areas)
                      </span>
                    </AlertDescription>
                  </Alert>

                  {/* Single Overlay Image - Medical Best Practice */}
                  <div className="flex justify-center">
                    <div className="space-y-3">
                      <h4 className="text-sm font-medium text-slate-700 text-center">
                        Diagnostic Attention Map
                      </h4>
                      <div className="flex justify-center">
                        <img 
                          src={analysisResult.overlayImageUrl} 
                          alt="AI Diagnostic Focus Areas" 
                          style={{width: '600px', height: '600px'}}
                          className="object-contain rounded-lg border-2 border-slate-200 shadow-xl bg-white"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Action Buttons */}
          <Card>
            <CardHeader>
              <CardTitle>Analysis Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                <Button 
                  onClick={handleAnalyze}
                  disabled={!uploadedImage || isAnalyzing}
                  className="flex items-center space-x-2"
                >
                  <Activity className="w-4 h-4" />
                  <span>{isAnalyzing ? 'Analyzing...' : 'Analyze'}</span>
                </Button>
                
                <Button 
                  onClick={handleGradCAM}
                  variant="outline"
                  disabled={!analysisResult || isGeneratingGradCAM}
                  className="flex items-center space-x-2"
                >
                  <Eye className="w-4 h-4" />
                  <span>{isGeneratingGradCAM ? 'Generating...' : 'Grad CAM'}</span>
                </Button>
                
                <Button 
                  onClick={handleSaveResult}
                  variant="outline"
                  disabled={!analysisResult}
                  className="flex items-center space-x-2"
                >
                  <Save className="w-4 h-4" />
                  <span>Save Result</span>
                </Button>
                
                <Button 
                  onClick={handleClearAll}
                  variant="outline"
                  disabled={!uploadedImage && !analysisResult && !gradCAMResult}
                  className="flex items-center space-x-2 text-orange-600 border-orange-300 hover:bg-orange-50 hover:border-orange-400"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Clear All</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Vital Signs and AI Chatbot */}
        <div className="lg:col-span-1 space-y-6">
          {/* Vital Signs Monitoring */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Activity className="w-5 h-5" />
                <span>Vital Signs Monitor</span>
                <div className={`ml-auto w-2 h-2 rounded-full ${
                  vitalSigns.status === 'normal' ? 'bg-green-500' :
                  vitalSigns.status === 'warning' ? 'bg-yellow-500' :
                  vitalSigns.status === 'critical' ? 'bg-red-500' :
                  'bg-orange-500'
                }`}></div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                {/* Heart Rate */}
                <div className="bg-slate-50 p-4 rounded-lg text-center">
                  <div className="flex items-center justify-center mb-2">
                    <Activity className="w-4 h-4 text-red-500 mr-1" />
                    <span className="text-sm text-slate-600">Heart Rate</span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-2xl font-semibold text-slate-900">
                      {vitalSigns.heartRate === 0 ? '--' : vitalSigns.heartRate}
                    </p>
                    <p className="text-xs text-slate-500">BPM</p>
                  </div>
                </div>

                {/* SpO2 */}
                <div className="bg-slate-50 p-4 rounded-lg text-center">
                  <div className="flex items-center justify-center mb-2">
                    <div className="w-4 h-4 bg-blue-500 rounded-full mr-1"></div>
                    <span className="text-sm text-slate-600">Blood Oxygen</span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-2xl font-semibold text-slate-900">
                      {vitalSigns.spO2 === 0 ? '--' : `${vitalSigns.spO2}%`}
                    </p>
                    <p className="text-xs text-slate-500">SpO2</p>
                  </div>
                </div>
              </div>

              {/* Status Indicator */}
              <div className="mt-4 text-center">
                <span className={`text-xs px-2 py-1 rounded-full ${
                  vitalSigns.status === 'normal' ? 'bg-green-100 text-green-800' :
                  vitalSigns.status === 'warning' ? 'bg-yellow-100 text-yellow-800' :
                  vitalSigns.status === 'critical' ? 'bg-red-100 text-red-800' :
                  'bg-orange-100 text-orange-800'
                }`}>
                  Status: {vitalSigns.status === 'normal' ? 'Normal' :
                          vitalSigns.status === 'warning' ? 'Warning' :
                          vitalSigns.status === 'critical' ? 'Critical' :
                          'No Signal Detected'}
                </span>
              </div>

              {/* Last Updated */}
              <div className="mt-2 text-center">
                <p className="text-xs text-slate-500">
                  {vitalSigns.status === 'no_signal' ? 
                    'Connect sensor or place finger on sensor' :
                    `Last updated: ${new Date(vitalSigns.timestamp).toLocaleTimeString()}`
                  }
                </p>
              </div>
            </CardContent>
          </Card>

          {/* AI Chatbot Section */}
          <Card className="h-[500px] flex flex-col">
            <CardHeader className="flex-shrink-0">
              <CardTitle className="flex items-center space-x-2">
                <MessageSquare className="w-5 h-5" />
                <span>AI Assistant</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col min-h-0 p-4">
              {/* Chat Messages Container - Fixed height with proper overflow */}
              <div 
                ref={chatMessagesRef} 
                className="flex-1 overflow-y-auto mb-4 pr-2"
                style={{ 
                  minHeight: '0',
                  maxHeight: '100%'
                }}
              >
                <div className="space-y-3 w-full">
                  {chatMessages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex w-full ${
                        message.sender === 'user' ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      <div className={`flex items-start gap-2 max-w-[85%] ${
                        message.sender === 'user' ? 'flex-row-reverse' : 'flex-row'
                      }`}>
                        {/* Avatar */}
                        <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0">
                          {message.sender === 'ai' ? (
                            <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
                              <Bot className="w-3 h-3 text-blue-600" />
                            </div>
                          ) : (
                            <div className="w-6 h-6 bg-slate-100 rounded-full flex items-center justify-center">
                              <User className="w-3 h-3 text-slate-600" />
                            </div>
                          )}
                        </div>
                        {/* Message bubble */}
                        <div
                          className={`p-3 rounded-lg text-sm leading-relaxed ${
                            message.sender === 'user'
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-100 text-slate-900'
                          }`}
                          style={{ 
                            wordWrap: 'break-word',
                            overflowWrap: 'break-word',
                            wordBreak: 'break-word',
                            maxWidth: '100%'
                          }}
                        >
                          {message.message}
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {/* Loading indicator */}
                  {isChatLoading && (
                    <div className="flex justify-start w-full">
                      <div className="flex items-start gap-2 max-w-[85%]">
                        <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <Bot className="w-3 h-3 text-blue-600" />
                        </div>
                        <div className="bg-slate-100 p-3 rounded-lg">
                          <div className="flex space-x-1">
                            <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
                            <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                            <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Chat Input - Fixed at bottom */}
              <div className="flex-shrink-0 flex gap-2">
                <Textarea
                  value={currentMessage}
                  onChange={(e) => setCurrentMessage(e.target.value)}
                  placeholder="Ask me about the analysis..."
                  className="min-h-[40px] max-h-20 resize-none flex-1"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                />
                <Button 
                  onClick={handleSendMessage}
                  disabled={!currentMessage.trim() || isChatLoading}
                  size="sm"
                  className="self-end h-10"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}