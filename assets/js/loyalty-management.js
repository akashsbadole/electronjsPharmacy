// Loyalty Management JavaScript

$(document).ready(function() {
    // Load loyalty overview when modal is shown
    $('#loyaltyManagementModal').on('shown.bs.modal', function() {
        loadLoyaltyOverview();
    });
    
    // Load promotions when modal is shown
    $('#promotionsManagementModal').on('shown.bs.modal', function() {
        loadPromotions();
    });
    
    // Load rewards when modal is shown
    $('#rewardsManagementModal').on('shown.bs.modal', function() {
        loadRewards();
    });
    
    // Handle promotion search
    $('#promotionSearch').on('input', function() {
        loadPromotions();
    });
    
    // Handle reward search
    $('#rewardSearch').on('input', function() {
        loadRewards();
    });
    
    // Handle loyalty settings form submission
    $('#loyaltySettingsForm').on('submit', function(e) {
        e.preventDefault();
        saveLoyaltySettings();
    });
    
    // Handle promotion form submission
    $('#savePromotion').on('submit', function(e) {
        e.preventDefault();
        savePromotion();
    });
    
    // Handle reward form submission
    $('#saveReward').on('submit', function(e) {
        e.preventDefault();
        saveReward();
    });
    
    // Handle promotion type change
    $('#promotionType').on('change', function() {
        updatePromotionValueField();
    });
    
    // Initialize promotion value field
    updatePromotionValueField();
});

// Load loyalty overview
function loadLoyaltyOverview() {
    $.get(api + 'loyalty-analytics/overview', function(data) {
        $('#totalMembers').text(data.totalMembers || 0);
        $('#activeMembers').text(data.activeMembers || 0);
        $('#totalPointsIssued').text(data.totalPointsIssued || 0);
        $('#totalPointsRedeemed').text(data.totalPointsRedeemed || 0);
        
        // Update tier chart
        updateTierChart(data.tierDistribution || {});
    }).fail(function() {
        notiflix.Report.failure('Error', 'Failed to load loyalty overview', 'OK');
    });
}

// Load loyalty members
function loadLoyaltyMembers() {
    const search = $('#loyaltyMemberSearch').val();
    const tier = $('#tierFilter').val();
    
    $.get(api + 'loyalty/customers', { search: search, tier: tier }, function(data) {
        $('#loyaltyMembersBody').empty();
        
        if (data.length === 0) {
            $('#loyaltyMembersBody').html('<tr><td colspan="6">No members found</td></tr>');
            return;
        }
        
        data.forEach(function(member, index) {
            const row = `
                <tr>
                    <td>${member.customerName}</td>
                    <td><span class="loyalty-badge tier-${member.tier.toLowerCase()}">${member.tier}</span></td>
                    <td>${member.points}</td>
                    <td>${moment(member.memberSince).format('MMM DD, YYYY')}</td>
                    <td>${member.lastActivity ? moment(member.lastActivity).format('MMM DD, YYYY') : 'Never'}</td>
                    <td>
                        <button class="btn btn-sm btn-info" onclick="viewLoyaltyMemberDetails('${member.customerId}')">
                            <i class="fa fa-eye"></i>
                        </button>
                        <button class="btn btn-sm btn-warning" onclick="adjustLoyaltyPoints('${member.customerId}')">
                            <i class="fa fa-plus"></i>
                        </button>
                    </td>
                </tr>
            `;
            $('#loyaltyMembersBody').append(row);
        });
    }).fail(function() {
        notiflix.Report.failure('Error', 'Failed to load loyalty members', 'OK');
    });
}

// Load promotions
function loadPromotions() {
    const search = $('#promotionSearch').val();
    
    $.get(api + 'promotions', { search: search }, function(data) {
        $('#promotionsBody').empty();
        
        if (data.length === 0) {
            $('#promotionsBody').html('<tr><td colspan="8">No promotions found</td></tr>');
            return;
        }
        
        data.forEach(function(promotion, index) {
            const statusClass = promotion.isActive ? 'label-success' : 'label-default';
            const statusText = promotion.isActive ? 'Active' : 'Inactive';
            
            const row = `
                <tr>
                    <td>${promotion.name}</td>
                    <td>${formatPromotionType(promotion.type)}</td>
                    <td>${formatPromotionValue(promotion)}</td>
                    <td>${moment(promotion.startDate).format('MMM DD, YYYY')}</td>
                    <td>${moment(promotion.endDate).format('MMM DD, YYYY')}</td>
                    <td><span class="label ${statusClass}">${statusText}</span></td>
                    <td>${promotion.usageCount || 0} / ${promotion.usageLimit || '∞'}</td>
                    <td>
                        <button class="btn btn-sm btn-info" onclick="editPromotion('${promotion._id}')">
                            <i class="fa fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="deletePromotion('${promotion._id}')">
                            <i class="fa fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
            $('#promotionsBody').append(row);
        });
    }).fail(function() {
        notiflix.Report.failure('Error', 'Failed to load promotions', 'OK');
    });
}

// Load rewards
function loadRewards() {
    const search = $('#rewardSearch').val();
    
    $.get(api + 'rewards', { search: search }, function(data) {
        $('#rewardsCatalog').empty();
        
        if (data.length === 0) {
            $('#rewardsCatalog').html('<div class="col-md-12"><p>No rewards found</p></div>');
            return;
        }
        
        data.forEach(function(reward, index) {
            const rewardCard = `
                <div class="col-md-4">
                    <div class="rewards-card">
                        <img src="${reward.image || 'assets/images/default.jpg'}" class="rewards-image" alt="${reward.name}">
                        <h5 class="rewards-title">${reward.name}</h5>
                        <div class="rewards-points">${reward.points} points</div>
                        <p class="rewards-description">${reward.description}</p>
                        <div class="text-center">
                            <button class="btn btn-sm btn-info" onclick="editReward('${reward._id}')">
                                <i class="fa fa-edit"></i> Edit
                            </button>
                            <button class="btn btn-sm btn-danger" onclick="deleteReward('${reward._id}')">
                                <i class="fa fa-trash"></i> Delete
                            </button>
                        </div>
                    </div>
                </div>
            `;
            $('#rewardsCatalog').append(rewardCard);
        });
    }).fail(function() {
        notiflix.Report.failure('Error', 'Failed to load rewards', 'OK');
    });
}

// Save loyalty settings
function saveLoyaltySettings() {
    const formData = $('#loyaltySettingsForm').serialize();
    
    $.ajax({
        url: api + 'loyalty/settings',
        type: 'POST',
        data: formData,
        success: function(response) {
            notiflix.Report.success('Success', 'Loyalty settings saved successfully', 'OK');
        },
        error: function() {
            notiflix.Report.failure('Error', 'Failed to save loyalty settings', 'OK');
        }
    });
}

// Save promotion
function savePromotion() {
    const formData = $('#savePromotion').serialize();
    const promotionId = $('#promotion_id').val();
    const method = promotionId ? 'PUT' : 'POST';
    const url = promotionId ? api + 'promotions/' + promotionId : api + 'promotions';
    
    $.ajax({
        url: url,
        type: method,
        data: formData,
        success: function(response) {
            notiflix.Report.success('Success', 'Promotion saved successfully', 'OK');
            $('#newPromotionModal').modal('hide');
            $('#promotionsManagementModal').modal('show');
            loadPromotions();
        },
        error: function() {
            notiflix.Report.failure('Error', 'Failed to save promotion', 'OK');
        }
    });
}

// Save reward
function saveReward() {
    const formData = $('#saveReward').serialize();
    const rewardId = $('#reward_id').val();
    const method = rewardId ? 'PUT' : 'POST';
    const url = rewardId ? api + 'rewards/' + rewardId : api + 'rewards';
    
    $.ajax({
        url: url,
        type: method,
        data: formData,
        success: function(response) {
            notiflix.Report.success('Success', 'Reward saved successfully', 'OK');
            $('#newRewardModal').modal('hide');
            $('#rewardsManagementModal').modal('show');
            loadRewards();
        },
        error: function() {
            notiflix.Report.failure('Error', 'Failed to save reward', 'OK');
        }
    });
}

// Edit promotion
function editPromotion(promotionId) {
    $.get(api + 'promotions/' + promotionId, function(promotion) {
        $('#promotion_id').val(promotion._id);
        $('#promotionName').val(promotion.name);
        $('#promotionDescription').val(promotion.description);
        $('#promotionType').val(promotion.type);
        $('#promotionValue').val(promotion.value);
        $('#promotionStartDate').val(promotion.startDate);
        $('#promotionEndDate').val(promotion.endDate);
        $('#minimumPurchase').val(promotion.minimumPurchase);
        $('#usageLimit').val(promotion.usageLimit);
        $('#isActive').prop('checked', promotion.isActive);
        
        // Set customer tiers
        $('#customerTiers').val(promotion.customerTiers || []);
        
        updatePromotionValueField();
        
        $('#promotionsManagementModal').modal('hide');
        $('#newPromotionModal').modal('show');
    }).fail(function() {
        notiflix.Report.failure('Error', 'Failed to load promotion details', 'OK');
    });
}

// Delete promotion
function deletePromotion(promotionId) {
    notiflix.Confirm.show(
        'Delete Promotion?',
        'Are you sure you want to delete this promotion?',
        'Yes, delete it',
        'Cancel',
        function() {
            $.ajax({
                url: api + 'promotions/' + promotionId,
                type: 'DELETE',
                success: function() {
                    notiflix.Report.success('Success', 'Promotion deleted successfully', 'OK');
                    loadPromotions();
                },
                error: function() {
                    notiflix.Report.failure('Error', 'Failed to delete promotion', 'OK');
                }
            });
        }
    );
}

// Edit reward
function editReward(rewardId) {
    $.get(api + 'rewards/' + rewardId, function(reward) {
        $('#reward_id').val(reward._id);
        $('#rewardName').val(reward.name);
        $('#rewardDescription').val(reward.description);
        $('#rewardType').val(reward.type);
        $('#rewardValue').val(reward.value);
        $('#rewardPoints').val(reward.points);
        $('#rewardImage').val(reward.image);
        $('#rewardQuantity').val(reward.quantity);
        $('#rewardExpiry').val(reward.expiryDate);
        $('#rewardIsActive').prop('checked', reward.isActive);
        
        // Set customer tiers
        $('#rewardCustomerTiers').val(reward.customerTiers || []);
        
        $('#rewardsManagementModal').modal('hide');
        $('#newRewardModal').modal('show');
    }).fail(function() {
        notiflix.Report.failure('Error', 'Failed to load reward details', 'OK');
    });
}

// Delete reward
function deleteReward(rewardId) {
    notiflix.Confirm.show(
        'Delete Reward?',
        'Are you sure you want to delete this reward?',
        'Yes, delete it',
        'Cancel',
        function() {
            $.ajax({
                url: api + 'rewards/' + rewardId,
                type: 'DELETE',
                success: function() {
                    notiflix.Report.success('Success', 'Reward deleted successfully', 'OK');
                    loadRewards();
                },
                error: function() {
                    notiflix.Report.failure('Error', 'Failed to delete reward', 'OK');
                }
            });
        }
    );
}

// View loyalty member details
function viewLoyaltyMemberDetails(customerId) {
    // Implementation for viewing member details
    notiflix.Report.info('Info', 'Member details view to be implemented', 'OK');
}

// Adjust loyalty points
function adjustLoyaltyPoints(customerId) {
    // Implementation for adjusting points
    notiflix.Report.info('Info', 'Points adjustment to be implemented', 'OK');
}

// Load loyalty analytics
function loadLoyaltyAnalytics() {
    const period = $('#loyaltyAnalyticsPeriod').val();
    
    $.get(api + 'loyalty-analytics/trends', { period: period }, function(data) {
        // Update points trend chart
        updatePointsTrendChart(data.pointsTrend || []);
        
        // Update member activity chart
        updateMemberActivityChart(data.memberActivity || []);
    }).fail(function() {
        notiflix.Report.failure('Error', 'Failed to load loyalty analytics', 'OK');
    });
}

// Update promotion value field based on type
function updatePromotionValueField() {
    const type = $('#promotionType').val();
    const valueField = $('#promotionValue');
    const valueLabel = $('label[for="promotionValue"]');
    
    switch(type) {
        case 'percentage_discount':
            valueLabel.text('Percentage (%)');
            valueField.attr('min', '0');
            valueField.attr('max', '100');
            valueField.attr('step', '0.1');
            break;
        case 'fixed_amount':
            valueLabel.text('Amount');
            valueField.attr('min', '0');
            valueField.attr('max', '');
            valueField.attr('step', '0.01');
            break;
        case 'buy_x_get_y':
            valueLabel.text('Quantity');
            valueField.attr('min', '1');
            valueField.attr('max', '');
            valueField.attr('step', '1');
            break;
        case 'points_multiplier':
            valueLabel.text('Multiplier');
            valueField.attr('min', '1');
            valueField.attr('max', '');
            valueField.attr('step', '0.1');
            break;
        default:
            valueLabel.text('Value');
            valueField.attr('min', '0');
            valueField.attr('max', '');
            valueField.attr('step', '0.01');
    }
}

// Format promotion type for display
function formatPromotionType(type) {
    const types = {
        'percentage_discount': 'Percentage Discount',
        'fixed_amount': 'Fixed Amount',
        'buy_x_get_y': 'Buy X Get Y',
        'points_multiplier': 'Points Multiplier'
    };
    return types[type] || type;
}

// Format promotion value for display
function formatPromotionValue(promotion) {
    switch(promotion.type) {
        case 'percentage_discount':
            return promotion.value + '%';
        case 'fixed_amount':
            return validator.unescape(settings.symbol) + promotion.value;
        case 'buy_x_get_y':
            return 'Get ' + promotion.value + ' free';
        case 'points_multiplier':
            return promotion.value + 'x';
        default:
            return promotion.value;
    }
}

// Update tier chart
function updateTierChart(tierData) {
    const ctx = document.getElementById('tierChart').getContext('2d');
    
    // Destroy existing chart if it exists
    if (window.tierChartInstance) {
        window.tierChartInstance.destroy();
    }
    
    window.tierChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Basic', 'Silver', 'Gold', 'Platinum'],
            datasets: [{
                data: [
                    tierData.Basic || 0,
                    tierData.Silver || 0,
                    tierData.Gold || 0,
                    tierData.Platinum || 0
                ],
                backgroundColor: [
                    '#6c757d',
                    '#adb5bd',
                    '#ffc107',
                    '#e5e5e5'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

// Update points trend chart
function updatePointsTrendChart(trendData) {
    const ctx = document.getElementById('pointsTrendChart').getContext('2d');
    
    // Destroy existing chart if it exists
    if (window.pointsTrendChartInstance) {
        window.pointsTrendChartInstance.destroy();
    }
    
    window.pointsTrendChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: trendData.map(item => item.period),
            datasets: [
                {
                    label: 'Points Issued',
                    data: trendData.map(item => item.issued),
                    borderColor: '#5fbeaa',
                    backgroundColor: 'rgba(95, 190, 170, 0.1)',
                    fill: true
                },
                {
                    label: 'Points Redeemed',
                    data: trendData.map(item => item.redeemed),
                    borderColor: '#f05050',
                    backgroundColor: 'rgba(240, 80, 80, 0.1)',
                    fill: true
                }
            ]
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

// Update member activity chart
function updateMemberActivityChart(activityData) {
    const ctx = document.getElementById('memberActivityChart').getContext('2d');
    
    // Destroy existing chart if it exists
    if (window.memberActivityChartInstance) {
        window.memberActivityChartInstance.destroy();
    }
    
    window.memberActivityChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: activityData.map(item => item.period),
            datasets: [{
                label: 'Active Members',
                data: activityData.map(item => item.activeMembers),
                backgroundColor: '#5d9cec'
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