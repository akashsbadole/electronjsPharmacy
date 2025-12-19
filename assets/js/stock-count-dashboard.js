$(document).ready(function() {
    // Initialize dashboard
    loadDashboardData();
    
    // Auto-refresh every 30 seconds
    setInterval(loadDashboardData, 30000);
    
    // Initialize charts
    initializeCharts();
});

let countTrendChart = null;
let countTypeChart = null;

function loadDashboardData() {
    loadSummaryStats();
    loadActiveCounts();
    loadCounterPerformance();
    loadRecentActivities();
    updateCharts();
}

function loadSummaryStats() {
    $.ajax({
        url: '/api/stock-counts/dashboard/summary',
        method: 'GET',
        success: function(summary) {
            $('#activeCounts').text(summary.activeCounts);
            $('#activeCounters').text(summary.activeCounters);
            $('#completedToday').text(summary.completedToday);
            $('#avgCompletionTime').text(summary.avgCompletionTime);
            $('#pendingApproval').text(summary.pendingApproval);
            $('#highValueVariances').text(summary.highValueVariances);
            $('#accuracyRate').text(summary.accuracyRate + '%');
        },
        error: function(xhr, status, error) {
            console.error('Error loading summary stats:', error);
        }
    });
}

function loadActiveCounts() {
    $.ajax({
        url: '/api/stock-counts',
        method: 'GET',
        data: { status: 'ACTIVE', limit: 10 },
        success: function(response) {
            displayActiveCounts(response.stockCounts);
        },
        error: function(xhr, status, error) {
            console.error('Error loading active counts:', error);
            $('#activeCountsList').html(`
                <tr>
                    <td colspan="5" class="text-center text-danger">
                        Error loading active counts
                    </td>
                </tr>
            `);
        }
    });
}

function displayActiveCounts(counts) {
    const tbody = $('#activeCountsList');
    tbody.empty();
    
    if (counts.length === 0) {
        tbody.html(`
            <tr>
                <td colspan="5" class="text-center text-muted">
                    No active stock counts
                </td>
            </tr>
        `);
        return;
    }
    
    counts.forEach(count => {
        const progressPercent = count.totalItems > 0 ? 
            Math.round((count.countedItems / count.totalItems) * 100) : 0;
        
        const progressClass = progressPercent >= 75 ? 'progress-bar-success' :
                             progressPercent >= 50 ? 'progress-bar-info' :
                             progressPercent >= 25 ? 'progress-bar-warning' : 'progress-bar-danger';
        
        const assignedTo = count.assignedTo && count.assignedTo.length > 0 ? 
            count.assignedTo.slice(0, 2).join(', ') + 
            (count.assignedTo.length > 2 ? ` (+${count.assignedTo.length - 2})` : '') : 'Unassigned';
        
        const row = `
            <tr>
                <td>
                    <div>
                        <strong>${count.countName}</strong>
                        <br>
                        <small class="text-muted">${count.storeName || 'Unknown Store'}</small>
                    </div>
                </td>
                <td>${getTypeBadge(count.countType)}</td>
                <td>
                    <div class="progress" style="height: 20px;">
                        <div class="progress-bar ${progressClass}" 
                             style="width: ${progressPercent}%;" 
                             role="progressbar" 
                             aria-valuenow="${progressPercent}" 
                             aria-valuemin="0" 
                             aria-valuemax="100">
                            ${progressPercent}%
                        </div>
                    </div>
                    <small>${count.countedItems}/${count.totalItems}</small>
                </td>
                <td>${assignedTo}</td>
                <td>
                    <div class="btn-group">
                        <button class="btn btn-sm btn-primary" onclick="openCountSheet('${count._id}')" title="Open Count Sheet">
                            <i class="md md-clipboard"></i>
                        </button>
                        <button class="btn btn-sm btn-info" onclick="viewCountDetails('${count._id}')" title="View Details">
                            <i class="fa fa-eye"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
        tbody.append(row);
    });
}

function loadCounterPerformance() {
    $.ajax({
        url: '/api/users/counters/performance',
        method: 'GET',
        success: function(performance) {
            displayCounterPerformance(performance);
        },
        error: function(xhr, status, error) {
            console.error('Error loading counter performance:', error);
            $('#counterPerformanceList').html(`
                <tr>
                    <td colspan="5" class="text-center text-danger">
                        Error loading counter performance
                    </td>
                </tr>
            `);
        }
    });
}

function displayCounterPerformance(performance) {
    const tbody = $('#counterPerformanceList');
    tbody.empty();
    
    if (performance.length === 0) {
        tbody.html(`
            <tr>
                <td colspan="5" class="text-center text-muted">
                    No counter performance data available
                </td>
            </tr>
        `);
        return;
    }
    
    performance.forEach(counter => {
        const accuracyClass = counter.accuracy >= 95 ? 'text-success' :
                              counter.accuracy >= 90 ? 'text-warning' : 'text-danger';
        
        const statusBadge = counter.status === 'ACTIVE' ? '<span class="label label-success">Active</span>' :
                            counter.status === 'IDLE' ? '<span class="label label-warning">Idle</span>' :
                            '<span class="label label-default">Offline</span>';
        
        const row = `
            <tr>
                <td>
                    <div>
                        <strong>${counter.name}</strong>
                        <br>
                        <small class="text-muted">${counter.email}</small>
                    </div>
                </td>
                <td>${counter.activeCounts}</td>
                <td>${counter.totalItemsCounted}</td>
                <td class="${accuracyClass}">
                    <strong>${counter.accuracy}%</strong>
                </td>
                <td>${statusBadge}</td>
            </tr>
        `;
        tbody.append(row);
    });
}

function loadRecentActivities() {
    $.ajax({
        url: '/api/stock-counts/activities/recent',
        method: 'GET',
        data: { limit: 10 },
        success: function(activities) {
            displayRecentActivities(activities);
        },
        error: function(xhr, status, error) {
            console.error('Error loading recent activities:', error);
            $('#recentActivitiesList').html(`
                <li class="text-center text-danger">
                    Error loading recent activities
                </li>
            `);
        }
    });
}

function displayRecentActivities(activities) {
    const list = $('#recentActivitiesList');
    list.empty();
    
    if (activities.length === 0) {
        list.html(`
            <li class="text-center text-muted">
                No recent activities
            </li>
        `);
        return;
    }
    
    activities.forEach(activity => {
        const iconClass = getActivityIcon(activity.type);
        const timeAgo = getTimeAgo(activity.timestamp);
        
        const activityHtml = `
            <li>
                <div class="timeline-item">
                    <div class="timeline-point ${iconClass.class}"></div>
                    <div class="timeline-content">
                        <h5 class="timeline-title">${activity.title}</h5>
                        <p class="timeline-text">
                            ${activity.description}
                            <br>
                            <small class="text-muted">
                                <i class="md md-person"></i> ${activity.userName} • 
                                <i class="md md-schedule"></i> ${timeAgo}
                            </small>
                        </p>
                    </div>
                </div>
            </li>
        `;
        list.append(activityHtml);
    });
}

function getActivityIcon(type) {
    const icons = {
        'COUNT_CREATED': { class: 'timeline-point-info', icon: 'md-assignment' },
        'COUNT_STARTED': { class: 'timeline-point-primary', icon: 'md-play-arrow' },
        'COUNT_COMPLETED': { class: 'timeline-point-success', icon: 'md-check-circle' },
        'COUNT_CANCELLED': { class: 'timeline-point-danger', icon: 'md-close' },
        'ITEM_COUNTED': { class: 'timeline-point-warning', icon: 'md-clipboard' },
        'VARIANCE_APPROVED': { class: 'timeline-point-success', icon: 'md-thumb-up' },
        'VARIANCE_REJECTED': { class: 'timeline-point-danger', icon: 'md-thumb-down' }
    };
    
    return icons[type] || { class: 'timeline-point-default', icon: 'md-info' };
}

function getTimeAgo(timestamp) {
    const now = new Date();
    const activityTime = new Date(timestamp);
    const diffMs = now - activityTime;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    
    return activityTime.toLocaleDateString();
}

function initializeCharts() {
    // Count Trend Chart
    const trendCtx = document.getElementById('countTrendChart');
    if (trendCtx) {
        countTrendChart = new Chart(trendCtx.getContext('2d'), {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Completed',
                    data: [],
                    borderColor: '#5fbeaa',
                    backgroundColor: 'rgba(95, 190, 170, 0.1)',
                    tension: 0.4
                }, {
                    label: 'Created',
                    data: [],
                    borderColor: '#5d9cec',
                    backgroundColor: 'rgba(93, 156, 236, 0.1)',
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }
    
    // Count Type Chart
    const typeCtx = document.getElementById('countTypeChart');
    if (typeCtx) {
        countTypeChart = new Chart(typeCtx.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: [],
                datasets: [{
                    data: [],
                    backgroundColor: [
                        '#5d9cec',
                        '#5fbeaa',
                        '#ffcc00',
                        '#f05050',
                        '#ff7676'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        });
    }
}

function updateCharts() {
    updateCountTrendChart('week');
    updateCountTypeChart();
}

function updateCountTrendChart(period) {
    $.ajax({
        url: '/api/stock-counts/analytics/trends',
        method: 'GET',
        data: { period: period },
        success: function(trends) {
            if (countTrendChart) {
                countTrendChart.data.labels = trends.labels;
                countTrendChart.data.datasets[0].data = trends.completed;
                countTrendChart.data.datasets[1].data = trends.created;
                countTrendChart.update();
            }
        },
        error: function(xhr, status, error) {
            console.error('Error loading count trends:', error);
        }
    });
}

function updateCountTypeChart() {
    $.ajax({
        url: '/api/stock-counts/analytics/types',
        method: 'GET',
        success: function(types) {
            if (countTypeChart) {
                countTypeChart.data.labels = types.labels;
                countTypeChart.data.datasets[0].data = types.data;
                countTypeChart.update();
            }
        },
        error: function(xhr, status, error) {
            console.error('Error loading count types:', error);
        }
    });
}

function refreshDashboard() {
    loadDashboardData();
    showSuccess('Dashboard refreshed successfully!');
}

function showActiveCounts() {
    window.location.href = 'stock-count-management.html?filter=active';
}

function showPendingApprovals() {
    window.location.href = 'stock-count-variances.html?filter=pending';
}

function openCountSheet(countId) {
    window.location.href = `stock-count-sheet.html?id=${countId}`;
}

function viewCountDetails(countId) {
    window.location.href = `stock-count-management.html?view=${countId}`;
}

function viewCounterDetails(counterId) {
    $.ajax({
        url: `/api/users/${counterId}/counters/details`,
        method: 'GET',
        success: function(details) {
            // Populate modal with counter details
            $('#counterName').text(details.name);
            $('#counterActiveCounts').text(details.activeCounts);
            $('#counterTotalItems').text(details.totalItemsCounted);
            $('#counterAccuracy').text(details.accuracy + '%');
            
            // Load assigned counts
            const assignedCountsList = $('#assignedCountsList');
            assignedCountsList.empty();
            
            if (details.assignedCounts.length === 0) {
                assignedCountsList.html('<p class="text-muted">No assigned counts</p>');
            } else {
                let listHtml = '<ul class="list-group">';
                details.assignedCounts.forEach(count => {
                    const progress = count.totalItems > 0 ? 
                        Math.round((count.countedItems / count.totalItems) * 100) : 0;
                    
                    listHtml += `
                        <li class="list-group-item">
                            <div>
                                <strong>${count.countName}</strong>
                                <span class="pull-right">${progress}%</span>
                            </div>
                            <div class="progress m-t-5" style="height: 10px;">
                                <div class="progress-bar" style="width: ${progress}%"></div>
                            </div>
                        </li>
                    `;
                });
                listHtml += '</ul>';
                assignedCountsList.html(listHtml);
            }
            
            $('#counterDetailsModal').modal('show');
        },
        error: function(xhr, status, error) {
            console.error('Error loading counter details:', error);
            showError('Failed to load counter details.');
        }
    });
}

// Utility functions
function getTypeBadge(type) {
    const badges = {
        'FULL': '<span class="label label-default">Full</span>',
        'PARTIAL': '<span class="label label-info">Partial</span>',
        'CYCLE': '<span class="label label-warning">Cycle</span>',
        'SPOT': '<span class="label label-primary">Spot</span>',
        'EXPIRY': '<span class="label label-danger">Expiry</span>'
    };
    return badges[type] || '<span class="label label-default">Unknown</span>';
}

function showSuccess(message) {
    $('.alert').remove();
    
    const alertHtml = `
        <div class="alert alert-success alert-dismissible" style="position: fixed; top: 20px; right: 20px; z-index: 9999; min-width: 300px;">
            <button type="button" class="close" data-dismiss="alert" aria-hidden="true">&times;</button>
            <strong>Success!</strong> ${message}
        </div>
    `;
    
    $('body').append(alertHtml);
    
    setTimeout(() => {
        $('.alert-success').fadeOut();
    }, 5000);
}

function showError(message) {
    $('.alert').remove();
    
    const alertHtml = `
        <div class="alert alert-danger alert-dismissible" style="position: fixed; top: 20px; right: 20px; z-index: 9999; min-width: 300px;">
            <button type="button" class="close" data-dismiss="alert" aria-hidden="true">&times;</button>
            <strong>Error!</strong> ${message}
        </div>
    `;
    
    $('body').append(alertHtml);
    
    setTimeout(() => {
        $('.alert-danger').fadeOut();
    }, 10000);
}