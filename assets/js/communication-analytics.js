/**
 * Communication Analytics JavaScript
 */

// Global variables
let channelChart, typeChart, timelineChart;
let currentDateRange = 'month';
let analyticsData = {};

// Initialize page
$(document).ready(function() {
    loadAnalytics();
    loadTopTemplates();
    loadRecentCommunications();
    setupEventListeners();
});

/**
 * Set up event listeners
 */
function setupEventListeners() {
    // Date range change
    $('#date-range-selector').on('change', function() {
        currentDateRange = $(this).val();
        loadAnalytics();
    });
    
    // Custom date range
    $('#apply-custom-range').on('click', function() {
        const startDate = $('#start-date').val();
        const endDate = $('#end-date').val();
        
        if (!startDate || !endDate) {
            showNotification('Please select both start and end dates', 'warning');
            return;
        }
        
        loadAnalyticsWithCustomRange(startDate, endDate);
    });
    
    // Export button
    $('#export-analytics').on('click', function() {
        exportAnalytics();
    });
    
    // Chart type buttons
    $('.chart-type-btn').on('click', function() {
        const chartType = $(this).data('chart');
        const targetChart = $(this).data('target');
        
        if (targetChart === 'channel') {
            updateChannelChart(chartType);
        } else if (targetChart === 'type') {
            updateTypeChart(chartType);
        }
    });
    
    // Timeline granularity buttons
    $('.timeline-granularity-btn').on('click', function() {
        const granularity = $(this).data('granularity');
        updateTimelineChart(granularity);
    });
}

/**
 * Load analytics data
 */
function loadAnalytics() {
    $.ajax({
        url: '/api/customer-communication/analytics',
        method: 'GET',
        data: {
            dateRange: currentDateRange
        },
        success: function(data) {
            analyticsData = data;
            updateSummaryCards(data.summary);
            updateChannelChart('pie', data.byChannel);
            updateTypeChart('doughnut', data.byType);
            updateTimelineChart('day', data.timeline);
            updatePerformanceMetrics(data.performance);
        },
        error: function(xhr, status, error) {
            console.error('Error loading analytics:', error);
            showNotification('Error loading analytics data', 'error');
        }
    });
}

/**
 * Load analytics with custom date range
 */
function loadAnalyticsWithCustomRange(startDate, endDate) {
    $.ajax({
        url: '/api/customer-communication/analytics',
        method: 'GET',
        data: {
            dateRange: 'custom',
            startDate: startDate,
            endDate: endDate
        },
        success: function(data) {
            analyticsData = data;
            updateSummaryCards(data.summary);
            updateChannelChart('pie', data.byChannel);
            updateTypeChart('doughnut', data.byType);
            updateTimelineChart('day', data.timeline);
            updatePerformanceMetrics(data.performance);
            
            showNotification('Custom date range applied', 'success');
        },
        error: function(xhr, status, error) {
            console.error('Error loading analytics with custom range:', error);
            showNotification('Error applying custom date range', 'error');
        }
    });
}

/**
 * Update summary cards
 */
function updateSummaryCards(summary) {
    $('#total-sent').text(summary.total || 0);
    $('#total-delivered').text(summary.delivered || 0);
    $('#total-read').text(summary.read || 0);
    $('#total-failed').text(summary.failed || 0);
    
    // Calculate rates
    const deliveryRate = summary.total > 0 ? (summary.delivered / summary.total * 100).toFixed(1) : 0;
    const readRate = summary.delivered > 0 ? (summary.read / summary.delivered * 100).toFixed(1) : 0;
    const failureRate = summary.total > 0 ? (summary.failed / summary.total * 100).toFixed(1) : 0;
    
    $('#delivery-rate').text(deliveryRate + '%');
    $('#read-rate').text(readRate + '%');
    $('#failure-rate').text(failureRate + '%');
}

/**
 * Update channel chart
 */
function updateChannelChart(type, data) {
    const ctx = document.getElementById('channel-chart').getContext('2d');
    
    if (channelChart) {
        channelChart.destroy();
    }
    
    if (!data) {
        data = analyticsData.byChannel || {};
    }
    
    channelChart = new Chart(ctx, {
        type: type || 'pie',
        data: {
            labels: ['SMS', 'Email', 'WhatsApp', 'In-App', 'Push'],
            datasets: [{
                data: [
                    data.sms || 0,
                    data.email || 0,
                    data.whatsapp || 0,
                    data.in_app || 0,
                    data.push || 0
                ],
                backgroundColor: [
                    '#FF6384',
                    '#36A2EB',
                    '#25D366',
                    '#FFCE56',
                    '#4BC0C0'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

/**
 * Update type chart
 */
function updateTypeChart(type, data) {
    const ctx = document.getElementById('type-chart').getContext('2d');
    
    if (typeChart) {
        typeChart.destroy();
    }
    
    if (!data) {
        data = analyticsData.byType || {};
    }
    
    typeChart = new Chart(ctx, {
        type: type || 'doughnut',
        data: {
            labels: Object.keys(data).length > 0 ? Object.keys(data) : ['Marketing', 'Transactional', 'Reminder', 'Alert', 'Promotional'],
            datasets: [{
                data: Object.keys(data).length > 0 ? Object.values(data) : [0, 0, 0, 0, 0],
                backgroundColor: [
                    '#FF6384',
                    '#36A2EB',
                    '#FFCE56',
                    '#4BC0C0',
                    '#E74C3C'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

/**
 * Update timeline chart
 */
function updateTimelineChart(granularity, data) {
    const ctx = document.getElementById('timeline-chart').getContext('2d');
    
    if (timelineChart) {
        timelineChart.destroy();
    }
    
    if (!data) {
        data = generateTimelineData(granularity || 'day');
    }
    
    timelineChart = new Chart(ctx, {
        type: 'line',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            },
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

/**
 * Generate timeline data based on granularity
 */
function generateTimelineData(granularity) {
    const labels = [];
    const sentData = [];
    const deliveredData = [];
    const readData = [];
    
    // Generate appropriate labels based on granularity
    if (granularity === 'hour') {
        for (let i = 0; i < 24; i++) {
            labels.push(`${i}:00`);
            sentData.push(Math.floor(Math.random() * 50) + 10);
            deliveredData.push(Math.floor(Math.random() * 45) + 5);
            readData.push(Math.floor(Math.random() * 30) + 5);
        }
    } else if (granularity === 'day') {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        for (let i = 0; i < 7; i++) {
            labels.push(days[i]);
            sentData.push(Math.floor(Math.random() * 200) + 50);
            deliveredData.push(Math.floor(Math.random() * 180) + 30);
            readData.push(Math.floor(Math.random() * 120) + 20);
        }
    } else if (granularity === 'week') {
        for (let i = 1; i <= 4; i++) {
            labels.push(`Week ${i}`);
            sentData.push(Math.floor(Math.random() * 1000) + 200);
            deliveredData.push(Math.floor(Math.random() * 900) + 150);
            readData.push(Math.floor(Math.random() * 600) + 100);
        }
    } else if (granularity === 'month') {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
        for (let i = 0; i < 6; i++) {
            labels.push(months[i]);
            sentData.push(Math.floor(Math.random() * 3000) + 500);
            deliveredData.push(Math.floor(Math.random() * 2700) + 400);
            readData.push(Math.floor(Math.random() * 1800) + 300);
        }
    }
    
    return {
        labels: labels,
        datasets: [
            {
                label: 'Sent',
                data: sentData,
                borderColor: '#36A2EB',
                backgroundColor: 'rgba(54, 162, 235, 0.1)',
                tension: 0.4
            },
            {
                label: 'Delivered',
                data: deliveredData,
                borderColor: '#4BC0C0',
                backgroundColor: 'rgba(75, 192, 192, 0.1)',
                tension: 0.4
            },
            {
                label: 'Read',
                data: readData,
                borderColor: '#FFCE56',
                backgroundColor: 'rgba(255, 206, 86, 0.1)',
                tension: 0.4
            }
        ]
    };
}

/**
 * Update performance metrics
 */
function updatePerformanceMetrics(performance) {
    if (!performance) {
        performance = {
            deliveryRate: 92,
            openRate: 68,
            clickRate: 15,
            optoutRate: 2,
            avgResponseTime: 45
        };
    }
    
    $('#delivery-rate').text(performance.deliveryRate + '%');
    $('#open-rate').text(performance.openRate + '%');
    $('#click-rate').text(performance.clickRate + '%');
    $('#optout-rate').text(performance.optoutRate + '%');
    $('#response-time').text(performance.avgResponseTime + ' min');
}

/**
 * Load top templates
 */
function loadTopTemplates() {
    $.ajax({
        url: '/api/communication-templates/top-performing',
        method: 'GET',
        success: function(data) {
            const templates = data.templates || [];
            populateTopTemplatesTable(templates);
        },
        error: function(xhr, status, error) {
            console.error('Error loading top templates:', error);
            // Use sample data if API fails
            const sampleTemplates = [
                { name: 'Refill Reminder', type: 'SMS', performance: 95 },
                { name: 'Welcome Email', type: 'Email', performance: 88 },
                { name: 'Promotional Offer', type: 'WhatsApp', performance: 82 },
                { name: 'Order Confirmation', type: 'Email', performance: 78 },
                { name: 'Health Tip', type: 'SMS', performance: 72 }
            ];
            populateTopTemplatesTable(sampleTemplates);
        }
    });
}

/**
 * Populate top templates table
 */
function populateTopTemplatesTable(templates) {
    const tbody = $('#top-templates');
    tbody.empty();
    
    if (templates.length === 0) {
        tbody.append('<tr><td colspan="3" class="text-center">No template data available</td></tr>');
        return;
    }
    
    templates.forEach(function(template) {
        const performanceClass = template.performance >= 80 ? 'success' : 
                              template.performance >= 60 ? 'warning' : 'danger';
        
        tbody.append(`
            <tr>
                <td>${template.name}</td>
                <td><span class="badge badge-info">${template.type}</span></td>
                <td>
                    <div class="progress">
                        <div class="progress-bar bg-${performanceClass}" style="width: ${template.performance}%">
                            ${template.performance}%
                        </div>
                    </div>
                </td>
            </tr>
        `);
    });
}

/**
 * Load recent communications
 */
function loadRecentCommunications() {
    $.ajax({
        url: '/api/customer-communication/recent',
        method: 'GET',
        data: {
            limit: 20
        },
        success: function(data) {
            const communications = data.communications || [];
            populateRecentCommunicationsTable(communications);
        },
        error: function(xhr, status, error) {
            console.error('Error loading recent communications:', error);
            // Use sample data if API fails
            const sampleCommunications = [
                { date: new Date(), customer: 'John Doe', type: 'Refill Reminder', channel: 'SMS', status: 'DELIVERED' },
                { date: new Date(Date.now() - 3600000), customer: 'Jane Smith', type: 'Promotional Offer', channel: 'Email', status: 'READ' },
                { date: new Date(Date.now() - 7200000), customer: 'Bob Johnson', type: 'Order Confirmation', channel: 'WhatsApp', status: 'SENT' },
                { date: new Date(Date.now() - 10800000), customer: 'Alice Brown', type: 'Health Tip', channel: 'In-App', status: 'READ' },
                { date: new Date(Date.now() - 14400000), customer: 'Charlie Wilson', type: 'Appointment Reminder', channel: 'SMS', status: 'FAILED' }
            ];
            populateRecentCommunicationsTable(sampleCommunications);
        }
    });
}

/**
 * Populate recent communications table
 */
function populateRecentCommunicationsTable(communications) {
    const tbody = $('#recent-communications');
    tbody.empty();
    
    if (communications.length === 0) {
        tbody.append('<tr><td colspan="6" class="text-center">No recent communications</td></tr>');
        return;
    }
    
    communications.forEach(function(comm) {
        const statusClass = getStatusClass(comm.status);
        const channelIcon = getChannelIcon(comm.channel);
        
        tbody.append(`
            <tr>
                <td>${formatDateTime(comm.date)}</td>
                <td>${comm.customer}</td>
                <td>${comm.type}</td>
                <td><i class="${channelIcon}"></i> ${comm.channel}</td>
                <td><span class="badge ${statusClass}">${comm.status}</span></td>
                <td>
                    <button type="button" class="btn btn-sm btn-info" onclick="viewCommunication('${comm.id}')">
                        <i class="ti-eye"></i> View
                    </button>
                </td>
            </tr>
        `);
    });
}

/**
 * Export analytics
 */
function exportAnalytics() {
    const params = {
        dateRange: currentDateRange
    };
    
    if (currentDateRange === 'custom') {
        params.startDate = $('#start-date').val();
        params.endDate = $('#end-date').val();
    }
    
    $.ajax({
        url: '/api/customer-communication/analytics/export',
        method: 'GET',
        data: params,
        success: function(data) {
            // Create a download link for CSV
            const csvContent = data.csv;
            const blob = new Blob([csvContent], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.setAttribute('hidden', '');
            a.setAttribute('href', url);
            a.setAttribute('download', `communication-analytics-${currentDateRange}.csv`);
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            showNotification('Analytics exported successfully', 'success');
        },
        error: function(xhr, status, error) {
            console.error('Error exporting analytics:', error);
            showNotification('Error exporting analytics', 'error');
        }
    });
}

/**
 * View communication details
 */
function viewCommunication(communicationId) {
    // In a real implementation, this would open a modal with communication details
    showNotification(`Viewing communication ${communicationId}`, 'info');
}

/**
 * Get status class
 */
function getStatusClass(status) {
    switch (status) {
        case 'SENT':
            return 'badge-primary';
        case 'DELIVERED':
            return 'badge-success';
        case 'READ':
            return 'badge-info';
        case 'FAILED':
            return 'badge-danger';
        default:
            return 'badge-secondary';
    }
}

/**
 * Get channel icon
 */
function getChannelIcon(channel) {
    switch (channel) {
        case 'SMS':
            return 'ti-comment';
        case 'EMAIL':
            return 'ti-email';
        case 'WHATSAPP':
            return 'ti-comment-alt';
        case 'IN_APP':
            return 'ti-mobile';
        case 'PUSH':
            return 'ti-bell';
        default:
            return 'ti-comment';
    }
}

/**
 * Format date and time
 */
function formatDateTime(dateString) {
    if (!dateString) return 'N/A';
    
    const date = new Date(dateString);
    return date.toLocaleString();
}

/**
 * Show notification
 */
function showNotification(message, type) {
    const alertClass = type === 'success' ? 'alert-success' : 
                     type === 'error' ? 'alert-danger' : 'alert-warning';
    
    const notification = `
        <div class="alert ${alertClass} alert-dismissible fade show" role="alert">
            <button type="button" class="close" data-dismiss="alert">&times;</button>
            ${message}
        </div>
    `;
    
    // Add notification to top of page
    $('.page-wrapper').prepend(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(function() {
        $('.alert').fadeOut();
    }, 5000);
}