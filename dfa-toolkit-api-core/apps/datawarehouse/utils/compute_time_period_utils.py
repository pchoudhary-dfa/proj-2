"""
Time Period Utilities for Compute Engine.

This module provides utilities for time period mapping, conversion, and validation
following the Laravel compute engine patterns for temporal aggregation operations.
"""

import re
from typing import List, Dict, Optional, Tuple
from datetime import datetime, timedelta
from apps.datawarehouse.constants import (
    PERIODICITY_MAP, FREQ_ANNUALLY, FREQ_QUARTERLY, FREQ_MONTHLY, 
    FREQ_DAILY, FREQ_HALFYEARLY, FREQ_FORTNIGHTLY
)
from apps.shared.config.config import settings


class TimePeriodUtils:
    """Utility class for time period operations."""
    
    @staticmethod
    def get_periodicity_name(freq_code: str) -> str:
        """
        Get human-readable periodicity name from frequency code.
        
        Args:
            freq_code: Frequency code (A/Q/M/D/H/F)
            
        Returns:
            Human-readable periodicity name
        """
        return PERIODICITY_MAP.get(freq_code, freq_code)
    
    @staticmethod
    def validate_frequency_code(freq_code: str) -> bool:
        """
        Validate frequency code.
        
        Args:
            freq_code: Frequency code to validate
            
        Returns:
            True if valid, False otherwise
        """
        return freq_code in PERIODICITY_MAP
    
    @staticmethod
    def parse_time_period(time_period: str) -> Dict[str, Optional[str]]:
        """
        Parse time period string to extract components.
        
        Supports formats like:
        - 2023A (Annual)
        - 2023Q1, 2023Q2, etc. (Quarterly)
        - 2023M01, 2023M12, etc. (Monthly)
        - 2023D001, 2023D365, etc. (Daily)
        - 2023H1, 2023H2 (Half-yearly)
        - 2023F01, 2023F26, etc. (Fortnightly)
        
        Args:
            time_period: Time period string
            
        Returns:
            Dictionary with parsed components (year, frequency, period_num)
        """
        # Annual pattern: 2023A
        annual_match = re.match(r'^(\d{4})A$', time_period)
        if annual_match:
            return {
                'year': annual_match.group(1),
                'frequency': FREQ_ANNUALLY,
                'period_num': '1',
                'original': time_period
            }
        
        # Quarterly pattern: 2023Q1, 2023Q2, etc.
        quarterly_match = re.match(r'^(\d{4})Q([1-4])$', time_period)
        if quarterly_match:
            return {
                'year': quarterly_match.group(1),
                'frequency': FREQ_QUARTERLY,
                'period_num': quarterly_match.group(2),
                'original': time_period
            }
        
        # Monthly pattern: 2023M01, 2023M12, etc.
        monthly_match = re.match(r'^(\d{4})M(\d{1,2})$', time_period)
        if monthly_match:
            month_num = monthly_match.group(2).zfill(2)
            if 1 <= int(month_num) <= 12:
                return {
                    'year': monthly_match.group(1),
                    'frequency': FREQ_MONTHLY,
                    'period_num': month_num,
                    'original': time_period
                }
        
        # Daily pattern: 2023D001, 2023D365, etc.
        daily_match = re.match(r'^(\d{4})D(\d{1,3})$', time_period)
        if daily_match:
            day_num = daily_match.group(2).zfill(3)
            if 1 <= int(day_num) <= 366:
                return {
                    'year': daily_match.group(1),
                    'frequency': FREQ_DAILY,
                    'period_num': day_num,
                    'original': time_period
                }
        
        # Half-yearly pattern: 2023H1, 2023H2
        halfyearly_match = re.match(r'^(\d{4})H([1-2])$', time_period)
        if halfyearly_match:
            return {
                'year': halfyearly_match.group(1),
                'frequency': FREQ_HALFYEARLY,
                'period_num': halfyearly_match.group(2),
                'original': time_period
            }
        
        # Fortnightly pattern: 2023F01, 2023F26, etc.
        fortnightly_match = re.match(r'^(\d{4})F(\d{1,2})$', time_period)
        if fortnightly_match:
            fortnight_num = fortnightly_match.group(2).zfill(2)
            if 1 <= int(fortnight_num) <= 26:
                return {
                    'year': fortnightly_match.group(1),
                    'frequency': FREQ_FORTNIGHTLY,
                    'period_num': fortnight_num,
                    'original': time_period
                }
        
        # If no pattern matches, return None values
        return {
            'year': None,
            'frequency': None,
            'period_num': None,
            'original': time_period
        }
    
    @staticmethod
    def get_source_periods_for_aggregation(
        target_period: str, 
        source_freq: str, 
        target_freq: str
    ) -> List[str]:
        """
        Get source time periods for temporal aggregation.
        
        This function maps target periods to their constituent source periods
        based on frequency conversion (e.g., quarterly to monthly).
        
        Args:
            target_period: Target time period (e.g., "2023Q1")
            source_freq: Source frequency code
            target_freq: Target frequency code
            
        Returns:
            List of source time periods
        """
        parsed_target = TimePeriodUtils.parse_time_period(target_period)
        
        if not parsed_target['year'] or not parsed_target['period_num']:
            return [target_period]  # Return original if parsing failed
        
        year = parsed_target['year']
        
        # Same frequency - return the same period
        if source_freq == target_freq:
            return [target_period]
        
        # Annual to other frequencies
        if target_freq == FREQ_ANNUALLY:
            if source_freq == FREQ_QUARTERLY:
                return [f"{year}Q{i}" for i in range(1, 5)]
            elif source_freq == FREQ_MONTHLY:
                return [f"{year}M{i:02d}" for i in range(1, 13)]
            elif source_freq == FREQ_HALFYEARLY:
                return [f"{year}H{i}" for i in range(1, 3)]
            elif source_freq == FREQ_FORTNIGHTLY:
                return [f"{year}F{i:02d}" for i in range(1, 27)]
        
        # Quarterly to monthly
        elif target_freq == FREQ_QUARTERLY and source_freq == FREQ_MONTHLY:
            quarter_num = int(parsed_target['period_num'])
            start_month = (quarter_num - 1) * 3 + 1
            return [f"{year}M{i:02d}" for i in range(start_month, start_month + 3)]
        
        # Half-yearly to quarterly
        elif target_freq == FREQ_HALFYEARLY and source_freq == FREQ_QUARTERLY:
            half_num = int(parsed_target['period_num'])
            if half_num == 1:
                return [f"{year}Q1", f"{year}Q2"]
            else:
                return [f"{year}Q3", f"{year}Q4"]
        
        # Half-yearly to monthly
        elif target_freq == FREQ_HALFYEARLY and source_freq == FREQ_MONTHLY:
            half_num = int(parsed_target['period_num'])
            if half_num == 1:
                return [f"{year}M{i:02d}" for i in range(1, 7)]
            else:
                return [f"{year}M{i:02d}" for i in range(7, 13)]
        
        # Monthly to fortnightly
        elif target_freq == FREQ_MONTHLY and source_freq == FREQ_FORTNIGHTLY:
            month_num = int(parsed_target['period_num'])
            # Approximate mapping - each month has ~2 fortnights
            start_fortnight = (month_num - 1) * 2 + 1
            return [f"{year}F{i:02d}" for i in range(start_fortnight, min(start_fortnight + 2, 27))]
        
        # Default: return original period if no mapping available
        return [target_period]
    
    @staticmethod
    def generate_time_period_sequence(
        start_period: str, 
        end_period: str, 
        frequency: str
    ) -> List[str]:
        """
        Generate a sequence of time periods between start and end periods.
        
        Args:
            start_period: Starting time period
            end_period: Ending time period
            frequency: Time period frequency
            
        Returns:
            List of time periods in sequence
        """
        start_parsed = TimePeriodUtils.parse_time_period(start_period)
        end_parsed = TimePeriodUtils.parse_time_period(end_period)
        
        if not start_parsed['year'] or not end_parsed['year']:
            return [start_period, end_period]
        
        start_year = int(start_parsed['year'])
        end_year = int(end_parsed['year'])
        
        periods = []
        
        if frequency == FREQ_ANNUALLY:
            for year in range(start_year, end_year + 1):
                periods.append(f"{year}A")
        
        elif frequency == FREQ_QUARTERLY:
            start_quarter = int(start_parsed['period_num']) if start_parsed['period_num'] else 1
            end_quarter = int(end_parsed['period_num']) if end_parsed['period_num'] else 4
            
            for year in range(start_year, end_year + 1):
                q_start = start_quarter if year == start_year else 1
                q_end = end_quarter if year == end_year else 4
                
                for quarter in range(q_start, q_end + 1):
                    periods.append(f"{year}Q{quarter}")
        
        elif frequency == FREQ_MONTHLY:
            start_month = int(start_parsed['period_num']) if start_parsed['period_num'] else 1
            end_month = int(end_parsed['period_num']) if end_parsed['period_num'] else 12
            
            for year in range(start_year, end_year + 1):
                m_start = start_month if year == start_year else 1
                m_end = end_month if year == end_year else 12
                
                for month in range(m_start, m_end + 1):
                    periods.append(f"{year}M{month:02d}")
        
        elif frequency == FREQ_HALFYEARLY:
            start_half = int(start_parsed['period_num']) if start_parsed['period_num'] else 1
            end_half = int(end_parsed['period_num']) if end_parsed['period_num'] else 2
            
            for year in range(start_year, end_year + 1):
                h_start = start_half if year == start_year else 1
                h_end = end_half if year == end_year else 2
                
                for half in range(h_start, h_end + 1):
                    periods.append(f"{year}H{half}")
        
        return periods
    
    @staticmethod
    def get_quarter_name(quarter_num: int, adaptation_id: Optional[str] = None) -> str:
        """
        Get quarter name based on adaptation settings.
        
        Args:
            quarter_num: Quarter number (1-4)
            adaptation_id: Adaptation ID for naming convention
            
        Returns:
            Quarter name string
        """
        if not adaptation_id:
            adaptation_id = getattr(settings, 'COMPUTE_ENGINE_ADAPTATION_ID', 'siso')
        
        # Different naming conventions based on adaptation
        if adaptation_id.lower() == 'siso':
            quarter_names = {
                1: "First Quarter",
                2: "Second Quarter", 
                3: "Third Quarter",
                4: "Fourth Quarter"
            }
        else:
            # Default naming
            quarter_names = {
                1: "Q1",
                2: "Q2",
                3: "Q3", 
                4: "Q4"
            }
        
        return quarter_names.get(quarter_num, f"Q{quarter_num}")
    
    @staticmethod
    def validate_time_period_format(time_period: str, expected_frequency: str) -> bool:
        """
        Validate time period format against expected frequency.
        
        Args:
            time_period: Time period string to validate
            expected_frequency: Expected frequency code
            
        Returns:
            True if format is valid for the frequency, False otherwise
        """
        parsed = TimePeriodUtils.parse_time_period(time_period)
        return parsed['frequency'] == expected_frequency
    
    @staticmethod
    def get_period_display_name(time_period: str) -> str:
        """
        Get human-readable display name for a time period.
        
        Args:
            time_period: Time period string
            
        Returns:
            Human-readable display name
        """
        parsed = TimePeriodUtils.parse_time_period(time_period)
        
        if not parsed['year'] or not parsed['frequency']:
            return time_period
        
        year = parsed['year']
        freq = parsed['frequency']
        period_num = parsed['period_num']
        
        if freq == FREQ_ANNUALLY:
            return f"Year {year}"
        elif freq == FREQ_QUARTERLY:
            quarter_name = TimePeriodUtils.get_quarter_name(int(period_num))
            return f"{quarter_name} {year}"
        elif freq == FREQ_MONTHLY:
            month_names = [
                "January", "February", "March", "April", "May", "June",
                "July", "August", "September", "October", "November", "December"
            ]
            month_idx = int(period_num) - 1
            if 0 <= month_idx < 12:
                return f"{month_names[month_idx]} {year}"
            return f"Month {period_num} {year}"
        elif freq == FREQ_HALFYEARLY:
            half_name = "First Half" if period_num == "1" else "Second Half"
            return f"{half_name} {year}"
        elif freq == FREQ_FORTNIGHTLY:
            return f"Fortnight {period_num} {year}"
        elif freq == FREQ_DAILY:
            return f"Day {period_num} {year}"
        
        return time_period
    
    @staticmethod
    def compare_time_periods(period1: str, period2: str) -> int:
        """
        Compare two time periods chronologically.
        
        Args:
            period1: First time period
            period2: Second time period
            
        Returns:
            -1 if period1 < period2, 0 if equal, 1 if period1 > period2
        """
        parsed1 = TimePeriodUtils.parse_time_period(period1)
        parsed2 = TimePeriodUtils.parse_time_period(period2)
        
        # If parsing failed, do string comparison
        if not parsed1['year'] or not parsed2['year']:
            return -1 if period1 < period2 else (1 if period1 > period2 else 0)
        
        year1, year2 = int(parsed1['year']), int(parsed2['year'])
        
        # Compare years first
        if year1 != year2:
            return -1 if year1 < year2 else 1
        
        # Same year, compare periods within year
        freq1, freq2 = parsed1['frequency'], parsed2['frequency']
        
        # If different frequencies, convert to comparable values
        if freq1 != freq2:
            # Convert to days for comparison (approximate)
            days1 = TimePeriodUtils._period_to_days(parsed1)
            days2 = TimePeriodUtils._period_to_days(parsed2)
            return -1 if days1 < days2 else (1 if days1 > days2 else 0)
        
        # Same frequency, compare period numbers
        num1 = int(parsed1['period_num']) if parsed1['period_num'] else 0
        num2 = int(parsed2['period_num']) if parsed2['period_num'] else 0
        
        return -1 if num1 < num2 else (1 if num1 > num2 else 0)
    
    @staticmethod
    def _period_to_days(parsed_period: Dict[str, Optional[str]]) -> int:
        """
        Convert parsed period to approximate day of year for comparison.
        
        Args:
            parsed_period: Parsed time period dictionary
            
        Returns:
            Approximate day of year
        """
        freq = parsed_period['frequency']
        period_num = int(parsed_period['period_num']) if parsed_period['period_num'] else 1
        
        if freq == FREQ_ANNUALLY:
            return 365  # End of year
        elif freq == FREQ_QUARTERLY:
            return period_num * 91  # ~91 days per quarter
        elif freq == FREQ_MONTHLY:
            return period_num * 30  # ~30 days per month
        elif freq == FREQ_HALFYEARLY:
            return period_num * 182  # ~182 days per half
        elif freq == FREQ_FORTNIGHTLY:
            return period_num * 14  # 14 days per fortnight
        elif freq == FREQ_DAILY:
            return period_num
        
        return 0