import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Textarea } from './ui/textarea';
import { Alert, AlertDescription } from './ui/alert';
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
  RotateCcw
} from 'lucide-react';
import { API_ENDPOINTS, VITAL_SIGNS_API } from '../config/api';

interface DashboardProps {
  onLogout: () => void;
}

// ===== TYPE DEFINITIONS FOR BACKEND INTEGRATION =====
interface AnalysisResult {
  diagnosis: string;
  confidence: number;
  timestamp: string;
  heatmapImageUrl?: string;
  overlayImageUrl?: string;
}

interface GradCAMResult {
  heatmapImageUrl: string;
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

export default function Dashboard({ onLogout }: DashboardProps) {
  // ===== STATE MANAGEMENT =====
  // Image upload state
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  
  // Analysis state
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  
  // Debug: Track analysisResult changes
  useEffect(() => {
    console.log('🔄 analysisResult state changed:', analysisResult);
  }, [analysisResult]);
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
        // Fetch real data from AWS API Gateway
        const response = await fetch(VITAL_SIGNS_API, {
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
        const response = await fetch(VITAL_SIGNS_API, {
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

  // ===== ANALYSIS FUNCTIONS =====
  /**
   * BACKEND INTEGRATION POINT 1: Image Analysis
   * 
   * Replace the mock implementation with actual API call:
   * 
   * const handleAnalyze = async () => {
   *   if (!imageFile) {
   *     alert('Please upload an image first');
   *     return;
   *   }
   * 
   *   setIsAnalyzing(true);
   *   
   *   try {
   *     const formData = new FormData();
   *     formData.append('image', imageFile);
   *     
   *     const response = await fetch('/api/analyze', {
   *       method: 'POST',
   *       body: formData,
   *       headers: {
   *         'Authorization': `Bearer ${authToken}` // if using auth tokens
   *       }
   *     });
   * 
   *     if (!response.ok) {
   *       throw new Error('Analysis failed');
   *     }
   * 
   *     const result: AnalysisResult = await response.json();
   *     setAnalysisResult(result);
   *     setIsAnalyzing(false);
   *     
   *   } catch (error) {
   *     console.error('Analysis failed:', error);
   *     setIsAnalyzing(false);
   *     alert('Analysis failed. Please try again.');
   *   }
   * };
   */
  const handleAnalyze = async () => {
    console.log('🔍 Analyze button clicked!');
    console.log('📁 Image file state:', imageFile);
    console.log('🖼️ Uploaded image state:', uploadedImage);
    
    if (!imageFile) {
      console.error('❌ No imageFile found!');
      alert('Please upload an image first');
      return;
    }

    console.log('🔍 Starting analysis...');
    console.log('📁 Image file:', imageFile.name, imageFile.size, 'bytes');
    console.log('🌐 API URL:', API_ENDPOINTS.ANALYSIS.ANALYZE);
    
    setIsAnalyzing(true);
    
    try {
      const formData = new FormData();
      formData.append('file', imageFile);  // Must match backend parameter name
      
      console.log('📤 Sending request to:', API_ENDPOINTS.ANALYSIS.ANALYZE);
      
      // Call backend API (configurable via environment variable)
      const response = await fetch(API_ENDPOINTS.ANALYSIS.ANALYZE, {
        method: 'POST',
        body: formData,
        // Don't set Content-Type header - browser will set it with boundary for FormData
        headers: {
          'Authorization': 'Bearer mock_token'
        }
      });

      console.log('📥 Response status:', response.status, response.statusText);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Response error:', errorText);
        throw new Error(`Analysis failed: ${response.status} ${response.statusText}`);
      }

      const result: AnalysisResult = await response.json();
      console.log('✅ Analysis result:', result);
      console.log('📋 Result details:', {
        diagnosis: result.diagnosis,
        confidence: result.confidence,
        timestamp: result.timestamp,
        hasHeatmap: !!result.heatmapImageUrl,
        hasOverlay: !!result.overlayImageUrl
      });
      
      // Verify result structure
      if (!result.diagnosis || result.confidence === undefined) {
        console.error('❌ Invalid result structure:', result);
        throw new Error('Invalid response format from backend');
      }
      
      console.log('💾 Setting analysis result state...');
      // Force state update with a new object reference to ensure React detects the change
      setAnalysisResult({
        diagnosis: result.diagnosis,
        confidence: result.confidence,
        timestamp: result.timestamp,
        heatmapImageUrl: result.heatmapImageUrl,
        overlayImageUrl: result.overlayImageUrl
      });
      setIsAnalyzing(false);
      console.log('✅ State updated, UI should refresh');
      
      // Force a small delay to ensure state propagation
      setTimeout(() => {
        console.log('🔄 Post-update check - analysisResult:', analysisResult);
      }, 100);
      
    } catch (error: any) {
      console.error('❌ Analysis failed:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      setIsAnalyzing(false);
      alert('Analysis failed: ' + (error.message || 'Unknown error. Check console for details.'));
    }
  };

  /**
   * BACKEND INTEGRATION POINT 2: Grad CAM Generation
   * 
   * Replace the mock implementation with actual API call:
   * 
   * const handleGradCAM = async () => {
   *   if (!imageFile || !analysisResult) {
   *     alert('Please analyze an image first before generating Grad CAM visualization');
   *     return;
   *   }
   * 
   *   setIsGeneratingGradCAM(true);
   *   
   *   try {
   *     const formData = new FormData();
   *     formData.append('image', imageFile);
   *     formData.append('analysisId', analysisResult.id); // if you have analysis ID
   *     
   *     const response = await fetch('/api/generate-gradcam', {
   *       method: 'POST',
   *       body: formData,
   *       headers: {
   *         'Authorization': `Bearer ${authToken}` // if using auth tokens
   *       }
   *     });
   * 
   *     if (!response.ok) {
   *       throw new Error('Grad CAM generation failed');
   *     }
   * 
   *     const gradcamData: GradCAMResult = await response.json();
   *     setGradCAMResult(gradcamData);
   *     setIsGeneratingGradCAM(false);
   *     
   *   } catch (error) {
   *     console.error('Grad CAM generation failed:', error);
   *     setIsGeneratingGradCAM(false);
   *     alert('Grad CAM visualization failed. Please try again.');
   *   }
   * };
   */
  const handleGradCAM = async () => {
    console.log('🎯 Grad CAM button clicked!');
    console.log('📁 Image file:', imageFile);
    console.log('📊 Analysis result:', analysisResult);
    
    if (!imageFile) {
      console.error('❌ No imageFile found!');
      alert('Please upload an image first');
      return;
    }
    
    if (!analysisResult) {
      console.error('❌ No analysisResult found! Please analyze first.');
      alert('Please analyze an image first before generating Grad CAM visualization');
      return;
    }

    console.log('🎯 Starting Grad CAM generation...');
    console.log('🌐 API URL:', API_ENDPOINTS.ANALYSIS.GRAD_CAM);
    
    setIsGeneratingGradCAM(true);
    
    try {
      const formData = new FormData();
      formData.append('file', imageFile);
      
      console.log('📤 Sending Grad CAM request to:', API_ENDPOINTS.ANALYSIS.GRAD_CAM);
      
      // Call Grad CAM endpoint (configurable via environment variable)
      const response = await fetch(API_ENDPOINTS.ANALYSIS.GRAD_CAM, {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': 'Bearer mock_token'
        }
      });

      console.log('📥 Grad CAM response status:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Grad CAM response error:', errorText);
        throw new Error(`Grad CAM generation failed: ${response.status} ${response.statusText}`);
      }

      const gradcamData = await response.json();
      console.log('✅ Grad CAM result:', gradcamData);
      console.log('📋 Grad CAM details:', {
        hasHeatmap: !!gradcamData.heatmapImageUrl,
        hasOverlay: !!gradcamData.overlayImageUrl,
        timestamp: gradcamData.timestamp
      });
      
      // Update analysis result with Grad CAM images
      // Create a completely new object to ensure React detects the change
      const updatedResult: AnalysisResult = {
        diagnosis: analysisResult.diagnosis,
        confidence: analysisResult.confidence,
        timestamp: analysisResult.timestamp,
        heatmapImageUrl: gradcamData.heatmapImageUrl || undefined,
        overlayImageUrl: gradcamData.overlayImageUrl || undefined
      };
      
      console.log('💾 Updating analysis result with Grad CAM images...');
      console.log('📸 Updated result:', updatedResult);
      setAnalysisResult(updatedResult);
      setIsGeneratingGradCAM(false);
      console.log('✅ Grad CAM state updated, UI should refresh');
      
      // Force a small delay to ensure state propagation
      setTimeout(() => {
        console.log('🔄 Post-update check - analysisResult:', analysisResult);
      }, 100);
      
    } catch (error: any) {
      console.error('❌ Grad CAM generation failed:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      setIsGeneratingGradCAM(false);
      alert('Grad CAM visualization failed: ' + (error.message || 'Unknown error. Check console for details.'));
    }
  };

  /**
   * BACKEND INTEGRATION POINT 3: Save Results
   * 
   * Replace the mock implementation with actual API call:
   * 
   * const handleSaveResult = async () => {
   *   if (!analysisResult) {
   *     alert('No analysis result to save');
   *     return;
   *   }
   * 
   *   try {
   *     const response = await fetch('/api/save-result', {
   *       method: 'POST',
   *       headers: {
   *         'Content-Type': 'application/json',
   *         'Authorization': `Bearer ${authToken}` // if using auth tokens
   *       },
   *       body: JSON.stringify({
   *         analysisResult,
   *         gradCAMResult, // if available
   *         patientId: 'current-patient-id', // if applicable
   *         timestamp: new Date().toISOString()
   *       })
   *     });
   * 
   *     if (!response.ok) {
   *       throw new Error('Save failed');
   *     }
   * 
   *     alert('Analysis result saved successfully!');
   *     
   *   } catch (error) {
   *     console.error('Save failed:', error);
   *     alert('Failed to save result. Please try again.');
   *   }
   * };
   */
  const handleSaveResult = async () => {
    if (!analysisResult) {
      alert('No analysis result to save');
      return;
    }

    try {
      // Mock save operation for demonstration
      alert('Analysis result saved successfully!');
      
    } catch (error) {
      console.error('Save failed:', error);
      alert('Failed to save result. Please try again.');
    }
  };

  /**
   * BACKEND INTEGRATION POINT 4: AI Chat
   * 
   * Replace the mock implementation with actual API call:
   * 
   * const handleSendMessage = async () => {
   *   if (!currentMessage.trim()) return;
   * 
   *   const userMessage: ChatMessage = {
   *     id: Date.now().toString(),
   *     sender: 'user',
   *     message: currentMessage,
   *     timestamp: new Date().toISOString()
   *   };
   * 
   *   setChatMessages(prev => [...prev, userMessage]);
   *   setCurrentMessage('');
   *   setIsChatLoading(true);
   * 
   *   try {
   *     const response = await fetch('/api/chat', {
   *       method: 'POST',
   *       headers: {
   *         'Content-Type': 'application/json',
   *         'Authorization': `Bearer ${authToken}` // if using auth tokens
   *       },
   *       body: JSON.stringify({
   *         message: currentMessage,
   *         context: {
   *           analysisResult,
   *           gradCAMResult,
   *           conversationHistory: chatMessages
   *         }
   *       })
   *     });
   * 
   *     if (!response.ok) {
   *       throw new Error('Chat request failed');
   *     }
   * 
   *     const aiResponse = await response.json();
   *     const aiMessage: ChatMessage = {
   *       id: (Date.now() + 1).toString(),
   *       sender: 'ai',
   *       message: aiResponse.message,
   *       timestamp: new Date().toISOString()
   *     };
   *     
   *     setChatMessages(prev => [...prev, aiMessage]);
   *     setIsChatLoading(false);
   * 
   *   } catch (error) {
   *     console.error('Chat failed:', error);
   *     setIsChatLoading(false);
   *     const errorMessage: ChatMessage = {
   *       id: (Date.now() + 1).toString(),
   *       sender: 'ai',
   *       message: 'Sorry, I encountered an error. Please try again.',
   *       timestamp: new Date().toISOString()
   *     };
   *     setChatMessages(prev => [...prev, errorMessage]);
   *   }
   * };
   */
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
      // Call backend chat API (configurable via environment variable)
      const response = await fetch(API_ENDPOINTS.CHAT, {
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
        throw new Error('Chat request failed');
      }

      const data = await response.json();
      const aiMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        message: data.message,
        timestamp: new Date().toISOString()
      };
      
      setChatMessages(prev => [...prev, aiMessage]);
      setIsChatLoading(false);

    } catch (error: any) {
      console.error('Chat failed:', error);
      setIsChatLoading(false);
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        message: 'Sorry, I encountered an error. Please try again.',
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
          {analysisResult && analysisResult.diagnosis && (
            <Card key={`analysis-${analysisResult.timestamp}`}>
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
                      {typeof analysisResult.confidence === 'number' ? `${analysisResult.confidence}%` : 'N/A'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Grad CAM Visualization Results */}
          {analysisResult && analysisResult.overlayImageUrl && (
            <Card key={`gradcam-${analysisResult.timestamp}`}>
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
                        <span className="font-medium text-red-600">🔴 Red/Orange regions:</span> High diagnostic importance (potential abnormalities)
                        <br />
                        <span className="font-medium text-blue-600">🔵 Blue/Purple regions:</span> Low diagnostic importance (normal areas)
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